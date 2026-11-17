import { rateFor, toVnd, type FxRates } from './money';
import type { Debt } from './types';

const BP = 10_000;

export function feeOn(balanceVnd: number, rateBp: number): number {
  return Math.round((Math.max(0, balanceVnd) * rateBp) / BP);
}

export function debtBalanceVnd(debt: Debt, rates: FxRates): number {
  return toVnd(debt.balanceMinor, debt.currency, rateFor(debt.currency, rates));
}

/**
 * Payment order: manual `priorityOrder` first (asc), then avalanche
 * (highest fee rate first), ties broken by smaller balance (clears a slot sooner).
 */
export function sortForPayoff(debts: Debt[], rates: FxRates): Debt[] {
  return [...debts].sort((a, b) => {
    const pa = a.priorityOrder ?? Number.POSITIVE_INFINITY;
    const pb = b.priorityOrder ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    if (a.monthlyFeeRateBp !== b.monthlyFeeRateBp) return b.monthlyFeeRateBp - a.monthlyFeeRateBp;
    return debtBalanceVnd(a, rates) - debtBalanceVnd(b, rates);
  });
}

export interface RolloverFeeLine {
  debtId: string;
  name: string;
  balanceVnd: number;
  paymentVnd: number;
  remainingVnd: number;
  /** Fee charged on what is left after this month's payment. */
  estimatedFeeVnd: number;
  /** Fee avoided thanks to this month's payment. */
  feeSavedVnd: number;
}

export interface RolloverFeeSummary {
  lines: RolloverFeeLine[];
  totalFeeVnd: number;
  totalFeeSavedVnd: number;
}

/**
 * Estimated rollover fee per debt for the current month:
 * fee = (balance - payment this month) * monthly_fee_rate.
 * `paymentsVnd` = what has been (or will be) paid this month per debt id.
 */
export function calculateMonthlyRolloverFees(
  debts: Debt[],
  rates: FxRates,
  paymentsVnd: Record<string, number> = {},
): RolloverFeeSummary {
  const lines = debts.map((d): RolloverFeeLine => {
    const balanceVnd = debtBalanceVnd(d, rates);
    const paymentVnd = Math.min(paymentsVnd[d.id] ?? 0, balanceVnd);
    const remainingVnd = balanceVnd - paymentVnd;
    return {
      debtId: d.id,
      name: d.name,
      balanceVnd,
      paymentVnd,
      remainingVnd,
      estimatedFeeVnd: feeOn(remainingVnd, d.monthlyFeeRateBp),
      feeSavedVnd: feeOn(paymentVnd, d.monthlyFeeRateBp),
    };
  });
  return {
    lines,
    totalFeeVnd: lines.reduce((s, l) => s + l.estimatedFeeVnd, 0),
    totalFeeSavedVnd: lines.reduce((s, l) => s + l.feeSavedVnd, 0),
  };
}

export interface ScheduleDebtLine {
  debtId: string;
  name: string;
  startVnd: number;
  paymentVnd: number;
  feeVnd: number;
  endVnd: number;
}

export interface ScheduleMonth {
  /** 1-based month index from the start month. */
  index: number;
  /** YYYY-MM */
  month: string;
  lines: ScheduleDebtLine[];
  paidVnd: number;
  feeVnd: number;
  /** Budget not needed for debt this month (final month surplus). */
  unusedBudgetVnd: number;
  totalEndVnd: number;
}

export interface PayoffSchedule {
  feasible: boolean;
  /** Why it is not feasible, if so. */
  reason: string | null;
  months: ScheduleMonth[];
  monthsToDebtFree: number | null;
  /** YYYY-MM of the month in which the last debt is cleared. */
  debtFreeMonth: string | null;
  totalPaidVnd: number;
  totalFeesVnd: number;
  /** Month index (1-based) each debt reaches zero. */
  payoffMonthByDebt: Record<string, number>;
}

export interface ScheduleOptions {
  rates: FxRates;
  /** YYYY-MM of the first simulated month. */
  startMonth: string;
  maxMonths?: number;
  /** Budget left for the first month (e.g. budget minus what was already paid this month). */
  firstMonthBudgetVnd?: number;
}

function addMonths(yyyyMm: string, n: number): string {
  const [y, m] = yyyyMm.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Month-by-month avalanche simulation, all in VND (foreign debts converted at `rates`).
 *
 * Each month:
 *  1. Pay every debt's minimum payment.
 *  2. Spend the rest of the budget in payoff order (priority override, then highest fee rate).
 *  3. Charge rollover fee on what remains: fee = remaining * rate. It is added to the balance.
 *
 * Starting balances are assumed to already include the current month's fee.
 */
export function generateAvalanchePayoffSchedule(
  debts: Debt[],
  monthlyBudgetVnd: number,
  { rates, startMonth, maxMonths = 120, firstMonthBudgetVnd }: ScheduleOptions,
): PayoffSchedule {
  if (!Number.isSafeInteger(monthlyBudgetVnd) || monthlyBudgetVnd <= 0) {
    throw new Error('monthlyBudgetVnd must be a positive integer');
  }
  const ordered = sortForPayoff(debts, rates);
  const state = new Map(ordered.map((d) => [d.id, debtBalanceVnd(d, rates)]));
  const minVnd = new Map(
    ordered.map((d) => [d.id, toVnd(d.minPaymentMinor, d.currency, rateFor(d.currency, rates))]),
  );

  const months: ScheduleMonth[] = [];
  const payoffMonthByDebt: Record<string, number> = {};
  for (const d of ordered) if ((state.get(d.id) ?? 0) === 0) payoffMonthByDebt[d.id] = 0;

  let totalPaidVnd = 0;
  let totalFeesVnd = 0;

  const totalOutstanding = () => [...state.values()].reduce((s, v) => s + v, 0);

  for (let i = 1; i <= maxMonths && totalOutstanding() > 0; i++) {
    let budget = i === 1 && firstMonthBudgetVnd !== undefined ? Math.max(0, firstMonthBudgetVnd) : monthlyBudgetVnd;
    const pay = new Map<string, number>();
    const start = new Map(state);

    // 1. Minimum payments
    const mins = ordered.reduce((s, d) => s + Math.min(minVnd.get(d.id) ?? 0, state.get(d.id) ?? 0), 0);
    if (mins > budget) {
      return {
        feasible: false,
        reason: `Minimum payments (${mins}) exceed monthly budget (${monthlyBudgetVnd})`,
        months, monthsToDebtFree: null, debtFreeMonth: null,
        totalPaidVnd, totalFeesVnd, payoffMonthByDebt,
      };
    }
    for (const d of ordered) {
      const p = Math.min(minVnd.get(d.id) ?? 0, state.get(d.id) ?? 0);
      pay.set(d.id, p);
      state.set(d.id, (state.get(d.id) ?? 0) - p);
      budget -= p;
    }

    // 2. Avalanche the remainder
    for (const d of ordered) {
      if (budget <= 0) break;
      const bal = state.get(d.id) ?? 0;
      const p = Math.min(bal, budget);
      pay.set(d.id, (pay.get(d.id) ?? 0) + p);
      state.set(d.id, bal - p);
      budget -= p;
    }

    // 3. Fees on remaining balance
    const lines: ScheduleDebtLine[] = ordered.map((d) => {
      const remaining = state.get(d.id) ?? 0;
      const fee = feeOn(remaining, d.monthlyFeeRateBp);
      state.set(d.id, remaining + fee);
      if (remaining === 0 && payoffMonthByDebt[d.id] === undefined) payoffMonthByDebt[d.id] = i;
      return {
        debtId: d.id,
        name: d.name,
        startVnd: start.get(d.id) ?? 0,
        paymentVnd: pay.get(d.id) ?? 0,
        feeVnd: fee,
        endVnd: remaining + fee,
      };
    });

    const paidVnd = lines.reduce((s, l) => s + l.paymentVnd, 0);
    const feeVnd = lines.reduce((s, l) => s + l.feeVnd, 0);
    totalPaidVnd += paidVnd;
    totalFeesVnd += feeVnd;
    months.push({
      index: i,
      month: addMonths(startMonth, i - 1),
      lines,
      paidVnd,
      feeVnd,
      unusedBudgetVnd: budget,
      totalEndVnd: totalOutstanding(),
    });

    // Fees outgrowing the budget means the debt can never be cleared.
    const prev = months[months.length - 2];
    if (prev && months[months.length - 1]!.totalEndVnd >= prev.totalEndVnd) {
      return {
        feasible: false,
        reason: 'Monthly fees are greater than or equal to the budget; balance never decreases',
        months, monthsToDebtFree: null, debtFreeMonth: null,
        totalPaidVnd, totalFeesVnd, payoffMonthByDebt,
      };
    }
  }

  const done = totalOutstanding() === 0;
  const last = months[months.length - 1];
  return {
    feasible: done,
    reason: done ? null : `Not paid off within ${maxMonths} months`,
    months,
    monthsToDebtFree: done ? months.length : null,
    debtFreeMonth: done ? (last?.month ?? null) : null,
    totalPaidVnd,
    totalFeesVnd,
    payoffMonthByDebt,
  };
}
