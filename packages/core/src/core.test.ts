import { describe, expect, it } from 'vitest';
import {
  calculateMonthlyRolloverFees,
  computeRoadmap,
  fromVnd,
  generateAvalanchePayoffSchedule,
  nextDayOfMonth,
  parseNaturalLanguageTransaction,
  toMinor,
  toVnd,
  type Debt,
  type ParserContext,
} from './index';

const RATES = { USD: 25_950, USDT: 25_950 };

const debt = (p: Partial<Debt> & Pick<Debt, 'id' | 'balanceMinor' | 'monthlyFeeRateBp'>): Debt => ({
  name: p.id,
  type: 'credit_card',
  currency: 'VND',
  minPaymentMinor: 0,
  statementDay: null,
  dueDay: null,
  priorityOrder: null,
  aliases: [],
  ...p,
});

// Seed scenario: ~165M total
const DEBTS: Debt[] = [
  debt({ id: 'friend-vnd', type: 'friend_debt', balanceMinor: 17_000_000, monthlyFeeRateBp: 0 }),
  debt({ id: 'hsbc', balanceMinor: 55_000_000, monthlyFeeRateBp: 180 }),
  debt({ id: 'friend-usd', type: 'friend_debt', currency: 'USD', balanceMinor: 50_000, monthlyFeeRateBp: 0 }),
  debt({ id: 'vpbank', balanceMinor: 80_000_000, monthlyFeeRateBp: 200 }),
];

describe('money', () => {
  it('parses decimals without float error', () => {
    expect(toMinor('0.1', 'USDT')).toBe(10);
    expect(toMinor('1150', 'USDT')).toBe(115_000);
    expect(toMinor('28000000', 'VND')).toBe(28_000_000);
    expect(() => toMinor('1.005', 'USD')).toThrow();
    expect(() => toMinor('-5', 'VND')).toThrow();
  });
  it('converts to VND with half-up rounding (same as SQL generated column)', () => {
    expect(toVnd(115_000, 'USDT', 25_950)).toBe(29_842_500);
    expect(toVnd(1, 'USD', 25_951)).toBe(260); // 259.51 -> 260
    expect(fromVnd(12_975_000, 'USD', 25_950)).toBe(50_000);
  });
});

describe('calculateMonthlyRolloverFees', () => {
  it('charges fee on remaining balance after payment and reports fee saved', () => {
    const r = calculateMonthlyRolloverFees(DEBTS, RATES, { vpbank: 28_000_000 });
    const vp = r.lines.find((l) => l.debtId === 'vpbank')!;
    expect(vp.remainingVnd).toBe(52_000_000);
    expect(vp.estimatedFeeVnd).toBe(1_040_000);
    expect(vp.feeSavedVnd).toBe(560_000);
    expect(r.lines.find((l) => l.debtId === 'hsbc')!.estimatedFeeVnd).toBe(990_000);
    expect(r.totalFeeVnd).toBe(2_030_000);
  });
  it('caps payment at the balance', () => {
    const r = calculateMonthlyRolloverFees(DEBTS, RATES, { 'friend-vnd': 99_000_000 });
    expect(r.lines.find((l) => l.debtId === 'friend-vnd')!.paymentVnd).toBe(17_000_000);
  });
});

describe('generateAvalanchePayoffSchedule', () => {
  const s = generateAvalanchePayoffSchedule(DEBTS, 28_000_000, { rates: RATES, startMonth: '2026-12' });

  it('pays the highest fee rate first and friend debts last', () => {
    expect(s.months[0]!.lines.find((l) => l.debtId === 'vpbank')!.paymentVnd).toBe(28_000_000);
    expect(s.payoffMonthByDebt.vpbank!).toBeLessThan(s.payoffMonthByDebt.hsbc!);
    expect(s.payoffMonthByDebt.hsbc!).toBeLessThanOrEqual(s.payoffMonthByDebt['friend-vnd']!);
  });

  it('balances: total paid = starting debt + all fees', () => {
    const start = 17_000_000 + 55_000_000 + 12_975_000 + 80_000_000;
    expect(s.feasible).toBe(true);
    expect(s.totalPaidVnd).toBe(start + s.totalFeesVnd);
    expect(s.months.at(-1)!.totalEndVnd).toBe(0);
    expect(s.debtFreeMonth).toBe(s.months.at(-1)!.month);
  });

  it('needs 7 months for ~165M at 28M/month once fees are counted', () => {
    expect(s.monthsToDebtFree).toBe(7);
    expect(s.months.map((m) => m.month)).toEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06']);
  });

  it('honours manual priority over fee rate', () => {
    const pinned = DEBTS.map((d) => (d.id === 'friend-usd' ? { ...d, priorityOrder: 1 } : d));
    const p = generateAvalanchePayoffSchedule(pinned, 28_000_000, { rates: RATES, startMonth: '2026-12' });
    const m1 = p.months[0]!.lines;
    expect(m1.find((l) => l.debtId === 'friend-usd')!.paymentVnd).toBe(12_975_000);
    expect(m1.find((l) => l.debtId === 'vpbank')!.paymentVnd).toBe(15_025_000);
    expect(p.totalFeesVnd).toBeGreaterThan(s.totalFeesVnd);
  });

  it('uses a reduced first-month budget when part of it was already paid', () => {
    const p = generateAvalanchePayoffSchedule(DEBTS, 28_000_000, { rates: RATES, startMonth: '2026-12', firstMonthBudgetVnd: 10_000_000 });
    expect(p.months[0]!.paidVnd).toBe(10_000_000);
    expect(p.months[1]!.paidVnd).toBe(28_000_000);
    expect(p.feasible).toBe(true);
  });

  it('pays minimums before avalanche', () => {
    const withMin = DEBTS.map((d) => (d.id === 'hsbc' ? { ...d, minPaymentMinor: 2_750_000 } : d));
    const p = generateAvalanchePayoffSchedule(withMin, 28_000_000, { rates: RATES, startMonth: '2026-12' });
    expect(p.months[0]!.lines.find((l) => l.debtId === 'hsbc')!.paymentVnd).toBe(2_750_000);
    expect(p.months[0]!.lines.find((l) => l.debtId === 'vpbank')!.paymentVnd).toBe(25_250_000);
  });

  it('reports infeasible when fees eat the whole budget', () => {
    const p = generateAvalanchePayoffSchedule([debt({ id: 'x', balanceMinor: 1_000_000_000, monthlyFeeRateBp: 300 })], 28_000_000, {
      rates: RATES,
      startMonth: '2026-12',
    });
    expect(p.feasible).toBe(false);
    expect(p.reason).toMatch(/never decreases/);
  });

  it('reports infeasible when minimums exceed budget', () => {
    const p = generateAvalanchePayoffSchedule([debt({ id: 'x', balanceMinor: 50_000_000, monthlyFeeRateBp: 200, minPaymentMinor: 30_000_000 })], 28_000_000, {
      rates: RATES,
      startMonth: '2026-12',
    });
    expect(p.feasible).toBe(false);
  });
});

describe('computeRoadmap', () => {
  const ef = { currentVnd: 0, targetVnd: 250_000_000, monthlyTargetVnd: 38_300_000 };
  it('phase 1 while any debt remains', () => {
    const r = computeRoadmap({ totalDebtVnd: 82_500_000, baselineDebtVnd: 165_000_000, emergencyFund: ef });
    expect(r.phase).toBe('debt_freedom');
    expect(r.progress).toBe(0.5);
  });
  it('never shows negative progress when fees push debt above baseline', () => {
    const r = computeRoadmap({ totalDebtVnd: 170_000_000, baselineDebtVnd: 165_000_000, emergencyFund: ef });
    expect(r.progress).toBe(0);
  });
  it('unlocks phase 2 at zero debt', () => {
    const r = computeRoadmap({ totalDebtVnd: 0, baselineDebtVnd: 165_000_000, emergencyFund: { ...ef, currentVnd: 38_300_000 } });
    expect(r.phase).toBe('emergency_fund');
    expect(r.monthsLeft).toBe(6);
  });
  it('asks for a fund target in a fresh workspace instead of claiming completion', () => {
    const r = computeRoadmap({ totalDebtVnd: 0, baselineDebtVnd: 0, emergencyFund: { currentVnd: 0, targetVnd: 0, monthlyTargetVnd: null } });
    expect(r).toMatchObject({ phase: 'emergency_fund', targetVnd: 0, monthsLeft: null });
  });
  it('complete when fund is full', () => {
    expect(computeRoadmap({ totalDebtVnd: 0, baselineDebtVnd: 1, emergencyFund: { ...ef, currentVnd: 250_000_000 } }).phase).toBe('complete');
  });
});

describe('nextDayOfMonth', () => {
  it('today counts', () => expect(nextDayOfMonth(17, '2026-11-17')).toEqual({ date: '2026-11-17', daysUntil: 0 }));
  it('rolls into next month and year', () => expect(nextDayOfMonth(5, '2026-12-20')).toEqual({ date: '2027-01-05', daysUntil: 16 }));
  it('clamps 31 to short months', () => expect(nextDayOfMonth(31, '2027-02-10')).toEqual({ date: '2027-02-28', daysUntil: 18 }));
});

describe('parseNaturalLanguageTransaction', () => {
  const ctx: ParserContext = {
    today: '2026-11-17',
    debts: [
      debt({ id: 'vpbank', name: 'VPBank', balanceMinor: 80_000_000, monthlyFeeRateBp: 200 }),
      debt({ id: 'friend-usd', name: 'Nợ bạn (USD)', currency: 'USD', balanceMinor: 50_000, monthlyFeeRateBp: 0 }),
    ],
    budgets: [],
    goals: [],
    rates: { USDT: 25_900, USD: 25_950 },
  };

  it('handles the spec example', async () => {
    const llm = async () =>
      JSON.stringify({
        transactions: [
          { type: 'income', amount: '1150', currency: 'USDT', fx_rate_vnd: 25950, debt_ref: null, budget_ref: null, goal_ref: null, occurred_on: null, note: 'Nhận 1150 USDT' },
          { type: 'debt_payment', amount: '28000000', currency: 'VND', fx_rate_vnd: null, debt_ref: 'vpbank', budget_ref: null, goal_ref: null, occurred_on: null, note: 'Trả thẻ VPBank' },
        ],
        warnings: [],
        needs_clarification: null,
      });
    const r = await parseNaturalLanguageTransaction('Vừa nhận 1150 USDT tỷ giá 25950, trích 28 triệu trả thẻ VPBank', ctx, llm);
    expect(r.drafts).toHaveLength(2);
    expect(r.drafts[0]).toMatchObject({ type: 'income', currency: 'USDT', amountMinor: 115_000, fxRateVnd: 25_950, amountVnd: 29_842_500, occurredOn: '2026-11-17' });
    expect(r.drafts[1]).toMatchObject({ type: 'debt_payment', debtId: 'vpbank', amountMinor: 28_000_000, debtAmountMinor: 28_000_000 });
    expect(r.warnings).toEqual([]);
  });

  it('converts a VND payment into a USD debt and rejects unknown ids', async () => {
    const llm = async () =>
      '```json\n' +
      JSON.stringify({
        transactions: [
          { type: 'debt_payment', amount: '5190000', currency: 'VND', fx_rate_vnd: null, debt_ref: 'friend-usd', budget_ref: null, goal_ref: null, occurred_on: null, note: 'Trả bạn' },
          { type: 'debt_payment', amount: '1000', currency: 'VND', fx_rate_vnd: null, debt_ref: 'made-up', budget_ref: null, goal_ref: null, occurred_on: null, note: 'x' },
        ],
        warnings: [],
        needs_clarification: null,
      }) +
      '\n```';
    const r = await parseNaturalLanguageTransaction('trả bạn 5tr19', ctx, llm);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]!.debtAmountMinor).toBe(20_000); // 5,190,000 / 25,950 = 200.00 USD
    expect(r.warnings.some((w) => w.includes('không xác định'))).toBe(true);
  });

  it('sends the receipt image to the LLM and records a debt payment from it', async () => {
    let seen: { user: string; imageDataUrl?: string } | null = null;
    const llm = async (req: { system: string; user: string; imageDataUrl?: string }) => {
      seen = req;
      return JSON.stringify({
        transactions: [
          { type: 'debt_payment', amount: '28000000', currency: 'VND', fx_rate_vnd: null, debt_ref: 'vpbank', budget_ref: null, goal_ref: null, occurred_on: '2026-11-16', note: 'CK thẻ VPBank' },
        ],
        warnings: [],
        needs_clarification: null,
      });
    };
    const img = 'data:image/jpeg;base64,/9j/4AAQ';
    const r = await parseNaturalLanguageTransaction({ imageDataUrl: img }, ctx, llm);
    expect(seen!.imageDataUrl).toBe(img);
    expect(seen!.user).toMatch(/ảnh/);
    expect(r.drafts[0]).toMatchObject({ type: 'debt_payment', debtId: 'vpbank', occurredOn: '2026-11-16', rawInput: '[ảnh]' });
    expect(r.newDebts).toEqual([]);
  });

  it('rejects non-image data URLs', async () => {
    await expect(parseNaturalLanguageTransaction({ imageDataUrl: 'data:text/html;base64,PGI+' }, ctx, async () => '{}')).rejects.toThrow(/format/);
  });

  it('normalizes new debts and skips ones that already exist', async () => {
    const llm = async () =>
      JSON.stringify({
        transactions: [],
        new_debts: [
          { name: 'Techcombank', type: 'credit_card', currency: 'VND', balance: '20000000', monthly_fee_rate_pct: 1.9, statement_day: 15, due_day: 40, aliases: ['tcb'] },
          { name: 'vpbank', type: 'credit_card', currency: 'VND', balance: '1', monthly_fee_rate_pct: 2, statement_day: null, due_day: null, aliases: [] },
        ],
        warnings: [],
        needs_clarification: null,
      });
    const r = await parseNaturalLanguageTransaction('thêm nợ thẻ Techcombank 20tr phí 1.9% sao kê ngày 15', ctx, llm);
    expect(r.newDebts).toEqual([
      { name: 'Techcombank', type: 'credit_card', currency: 'VND', balanceMinor: 20_000_000, monthlyFeeRateBp: 190, minPaymentMinor: 0, statementDay: 15, dueDay: null, priorityOrder: null, aliases: ['tcb'] },
    ]);
    expect(r.warnings.some((w) => w.includes('đã có'))).toBe(true);
  });

  it('throws on schema violations', async () => {
    await expect(parseNaturalLanguageTransaction('x', ctx, async () => '{"transactions":[{"type":"gift"}]}')).rejects.toThrow(/validation/);
  });
});
