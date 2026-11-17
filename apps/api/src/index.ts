import {
  CURRENCIES,
  TRANSACTION_TYPES,
  calculateMonthlyRolloverFees,
  computeRoadmap,
  debtBalanceVnd,
  fromVnd,
  generateAvalanchePayoffSchedule,
  nextDayOfMonth,
  parseNaturalLanguageTransaction,
  rateFor,
  sortForPayoff,
  todayVn,
  toVnd,
  type DashboardResponse,
  type DebtView,
  type TransactionView,
} from '@bank/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireUser, requireWorkspace } from './auth';
import {
  budgetSpendSince,
  debtPaymentsSince,
  loadBudgets,
  loadDebts,
  loadGoals,
  loadMonthlyDebtBudget,
  loadRates,
  type TransactionRow,
} from './db';
import { deepseekComplete } from './deepseek';
import { org } from './org';
import type { AppEnv } from './env';

const app = new Hono<AppEnv>().basePath('/api');

app.use('*', requireUser);
app.use('*', requireWorkspace);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof z.ZodError) return c.json({ error: 'Invalid request', issues: err.issues }, 400);
  if (err instanceof SyntaxError) return c.json({ error: 'Invalid JSON' }, 400);
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});

const monthStartOf = (today: string) => `${today.slice(0, 7)}-01`;

// ---------------------------------------------------------------------------
app.get('/dashboard', async (c) => {
  const db = c.env.DB;
  const ws = c.get('workspaceId');
  const today = todayVn();
  const monthStart = monthStartOf(today);
  const monthlyDebtBudgetVnd = await loadMonthlyDebtBudget(db, ws, c.env.MONTHLY_DEBT_BUDGET_VND);

  const [debts, rates, goals, budgets, paidMinor, spent, paidAllMinor] = await Promise.all([
    loadDebts(db, ws),
    loadRates(db),
    loadGoals(db, ws),
    loadBudgets(db, ws),
    debtPaymentsSince(db, ws, monthStart),
    budgetSpendSince(db, ws, monthStart),
    debtPaymentsSince(db, ws, '0000-01-01'),
  ]);

  const paidVnd: Record<string, number> = {};
  for (const d of debts) {
    paidVnd[d.id] = toVnd(paidMinor[d.id] ?? 0, d.currency, rateFor(d.currency, rates));
  }
  const paidThisMonthVnd = Object.values(paidVnd).reduce((s, v) => s + v, 0);

  // Balances in DB already reflect this month's payments; add them back so the
  // fee calc sees "balance before payment" and "payment".
  const beforePayment = debts.map((d) => ({ ...d, balanceMinor: d.balanceMinor + (paidMinor[d.id] ?? 0) }));
  const fees = calculateMonthlyRolloverFees(beforePayment, rates, paidVnd);

  const plan = generateAvalanchePayoffSchedule(debts, monthlyDebtBudgetVnd, {
    rates,
    startMonth: today.slice(0, 7),
    firstMonthBudgetVnd: monthlyDebtBudgetVnd - paidThisMonthVnd,
  });

  const rank = new Map(sortForPayoff(debts.filter((d) => d.balanceMinor > 0), rates).map((d, i) => [d.id, i + 1]));

  const views: DebtView[] = debts.map((d) => {
    const fee = fees.lines.find((l) => l.debtId === d.id)!;
    const payoffIdx = plan.payoffMonthByDebt[d.id];
    return {
      id: d.id,
      name: d.name,
      type: d.type,
      currency: d.currency,
      balanceMinor: d.balanceMinor,
      balanceVnd: debtBalanceVnd(d, rates),
      monthlyFeeRateBp: d.monthlyFeeRateBp,
      priorityOrder: d.priorityOrder,
      payoffRank: rank.get(d.id) ?? 0,
      paidThisMonthVnd: fee.paymentVnd,
      paidTotalVnd: toVnd(paidAllMinor[d.id] ?? 0, d.currency, rateFor(d.currency, rates)),
      estimatedFeeVnd: fee.estimatedFeeVnd,
      feeSavedVnd: fee.feeSavedVnd,
      nextStatement: d.statementDay ? nextDayOfMonth(d.statementDay, today) : null,
      nextDue: d.dueDay ? nextDayOfMonth(d.dueDay, today) : null,
      projectedPayoffMonth:
        payoffIdx === undefined ? null : payoffIdx === 0 ? today.slice(0, 7) : (plan.months[payoffIdx - 1]?.month ?? null),
    };
  });

  const totalDebtVnd = views.reduce((s, d) => s + d.balanceVnd, 0);
  const debtGoal = goals.find((g) => g.kind === 'debt_freedom');
  const efGoal = goals.find((g) => g.kind === 'emergency_fund');

  const body: DashboardResponse = {
    today,
    rates,
    roadmap: computeRoadmap({
      totalDebtVnd,
      baselineDebtVnd: debtGoal?.targetVnd ?? totalDebtVnd,
      emergencyFund: {
        currentVnd: efGoal?.currentVnd ?? 0,
        targetVnd: efGoal?.targetVnd ?? 0,
        monthlyTargetVnd: efGoal?.monthlyTargetVnd ?? null,
      },
    }),
    totalDebtVnd,
    monthlyDebtBudgetVnd,
    paidThisMonthVnd,
    feeSavedThisMonthVnd: fees.totalFeeSavedVnd,
    estimatedFeeThisMonthVnd: fees.totalFeeVnd,
    debts: views.sort((a, b) => (a.payoffRank || 99) - (b.payoffRank || 99)),
    plan: {
      feasible: plan.feasible,
      reason: plan.reason,
      debtFreeMonth: plan.debtFreeMonth,
      monthsToDebtFree: plan.monthsToDebtFree,
      totalFeesVnd: plan.totalFeesVnd,
    },
    // Month 1 of the plan only holds the budget left; add what was already paid this month.
    timeline: plan.months.map((m, i) => ({
      month: m.month,
      paidByDebt: Object.fromEntries(
        debts.map((d) => [
          d.id,
          (m.lines.find((l) => l.debtId === d.id)?.paymentVnd ?? 0) + (i === 0 ? (paidVnd[d.id] ?? 0) : 0),
        ]),
      ),
    })),
    goals,
    budgets: budgets.map((b) => ({ ...b, spentThisMonthVnd: spent[b.id] ?? 0 })),
  };
  return c.json(body);
});

// ---------------------------------------------------------------------------
app.get('/schedule', async (c) => {
  const ws = c.get('workspaceId');
  const budget = Number(c.req.query('budget') ?? (await loadMonthlyDebtBudget(c.env.DB, ws, c.env.MONTHLY_DEBT_BUDGET_VND)));
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new HTTPException(400, { message: 'budget must be a positive integer (VND)' });
  const today = todayVn();
  const [debts, rates, paidMinor] = await Promise.all([
    loadDebts(c.env.DB, ws),
    loadRates(c.env.DB),
    debtPaymentsSince(c.env.DB, ws, monthStartOf(today)),
  ]);
  // Same rule as /dashboard: this month only has the budget that is left.
  const paidThisMonthVnd = debts.reduce(
    (s, d) => s + toVnd(paidMinor[d.id] ?? 0, d.currency, rateFor(d.currency, rates)),
    0,
  );
  return c.json(
    generateAvalanchePayoffSchedule(debts, budget, {
      rates,
      startMonth: today.slice(0, 7),
      firstMonthBudgetVnd: budget - paidThisMonthVnd,
    }),
  );
});

// ---------------------------------------------------------------------------
const parseBody = z
  .object({
    text: z.string().trim().max(500).default(''),
    // ~3 MB of base64; the PWA downsizes photos to ~1600px JPEG before sending.
    imageDataUrl: z.string().max(4_000_000).optional(),
  })
  .refine((b) => b.text.length > 0 || b.imageDataUrl, { message: 'text or imageDataUrl is required' });

app.post('/parse', async (c) => {
  const { text, imageDataUrl } = parseBody.parse(await c.req.json());
  const db = c.env.DB;
  const ws = c.get('workspaceId');
  const [debts, rates, budgets, goals] = await Promise.all([loadDebts(db, ws), loadRates(db), loadBudgets(db, ws), loadGoals(db, ws)]);
  try {
    const result = await parseNaturalLanguageTransaction(
      { text, ...(imageDataUrl ? { imageDataUrl } : {}) },
      { today: todayVn(), debts, rates, budgets, goals },
      deepseekComplete(c.env),
    );
    return c.json(result);
  } catch (e) {
    console.error('parse failed', e);
    throw new HTTPException(502, { message: e instanceof Error ? e.message : 'Parse failed' });
  }
});

// ---------------------------------------------------------------------------
const txInput = z.object({
  type: z.enum(TRANSACTION_TYPES),
  currency: z.enum(CURRENCIES),
  amountMinor: z.number().int().positive(),
  fxRateVnd: z.number().int().positive(),
  debtId: z.string().nullable(),
  budgetId: z.string().nullable(),
  goalId: z.string().nullable(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(200),
  source: z.enum(['manual', 'ai']),
  rawInput: z.string().max(500).nullable(),
});
const createBody = z.object({ transactions: z.array(txInput).min(1).max(10) });

app.post('/transactions', async (c) => {
  const { transactions } = createBody.parse(await c.req.json());
  const db = c.env.DB;
  const ws = c.get('workspaceId');
  const user = c.get('user');
  const [debts, rates, budgets, goals] = await Promise.all([loadDebts(db, ws), loadRates(db), loadBudgets(db, ws), loadGoals(db, ws)]);
  const debtById = new Map(debts.map((d) => [d.id, d]));
  const budgetIds = new Set(budgets.map((b) => b.id));
  const goalIds = new Set(goals.map((g) => g.id));

  const stmts = transactions.map((t) => {
    if (t.currency === 'VND' && t.fxRateVnd !== 1) throw new HTTPException(400, { message: 'VND must have fxRateVnd = 1' });
    // Ids must belong to this workspace (FKs alone would accept another workspace's ids).
    if (t.budgetId && !budgetIds.has(t.budgetId)) throw new HTTPException(400, { message: 'Mục ngân sách không thuộc không gian này' });
    if (t.goalId && !goalIds.has(t.goalId)) throw new HTTPException(400, { message: 'Quỹ không thuộc không gian này' });

    // Server is authoritative for the amount applied to a debt.
    let debtAmountMinor: number | null = null;
    if (t.type === 'debt_payment' || t.type === 'debt_fee') {
      const debt = t.debtId ? debtById.get(t.debtId) : undefined;
      if (!debt) throw new HTTPException(400, { message: `Unknown debt ${t.debtId}` });
      if (debt.currency === t.currency) {
        debtAmountMinor = t.amountMinor;
      } else {
        const vnd = toVnd(t.amountMinor, t.currency, t.fxRateVnd);
        const debtRate = debt.currency === 'VND' ? 1 : rateFor(debt.currency, { ...rates, [t.currency]: t.fxRateVnd });
        debtAmountMinor = fromVnd(vnd, debt.currency, debtRate);
      }
    }

    return db
      .prepare(
        `INSERT INTO transactions
           (id, workspace_id, created_by, type, currency, amount_minor, fx_rate_vnd, debt_id, debt_amount_minor,
            budget_id, goal_id, occurred_on, note, source, raw_input)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        ws,
        user.id,
        t.type,
        t.currency,
        t.amountMinor,
        t.fxRateVnd,
        t.debtId,
        debtAmountMinor,
        t.budgetId,
        t.goalId,
        t.occurredOn,
        t.note,
        t.source,
        t.rawInput,
      );
  });

  try {
    await db.batch(stmts); // atomic: all or nothing
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('balance_minor >= 0') || msg.includes('CHECK constraint failed')) {
      throw new HTTPException(409, { message: 'Số trả vượt dư nợ hoặc dữ liệu không hợp lệ' });
    }
    if (msg.includes('FOREIGN KEY')) throw new HTTPException(400, { message: 'Khoản nợ / quỹ / ngân sách không tồn tại' });
    throw e;
  }
  return c.json({ inserted: stmts.length }, 201);
});

app.get('/transactions', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200);
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, COALESCE(NULLIF(u.name, ''), u.email) AS created_by_name
       FROM transactions t LEFT JOIN users u ON u.id = t.created_by
      WHERE t.workspace_id = ?
      ORDER BY t.occurred_on DESC, t.created_at DESC LIMIT ?`,
  )
    .bind(c.get('workspaceId'), limit)
    .all<TransactionRow>();
  const rows: TransactionView[] = results.map((r) => ({
    id: r.id,
    type: r.type as TransactionView['type'],
    currency: r.currency,
    amountMinor: r.amount_minor,
    fxRateVnd: r.fx_rate_vnd,
    amountVnd: r.amount_vnd,
    debtId: r.debt_id,
    debtAmountMinor: r.debt_amount_minor,
    budgetId: r.budget_id,
    goalId: r.goal_id,
    occurredOn: r.occurred_on,
    note: r.note,
    source: r.source as TransactionView['source'],
    createdAt: r.created_at,
    createdByName: r.created_by_name,
  }));
  return c.json(rows);
});

app.delete('/transactions/:id', async (c) => {
  const res = await c.env.DB.prepare('DELETE FROM transactions WHERE id = ? AND workspace_id = ?')
    .bind(c.req.param('id'), c.get('workspaceId'))
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: 'Not found' });
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
app.get('/debts', async (c) => c.json(await loadDebts(c.env.DB, c.get('workspaceId'))));

const newDebtSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(['credit_card', 'personal_loan', 'friend_debt']),
  currency: z.enum(CURRENCIES),
  balanceMinor: z.number().int().min(0),
  monthlyFeeRateBp: z.number().int().min(0).max(10_000),
  minPaymentMinor: z.number().int().min(0).default(0),
  statementDay: z.number().int().min(1).max(31).nullable().default(null),
  dueDay: z.number().int().min(1).max(31).nullable().default(null),
  priorityOrder: z.number().int().nullable().default(null),
  aliases: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
const createDebtsBody = z.object({ debts: z.array(newDebtSchema).min(1).max(5) });

/** Shift the Phase 1 baseline so progress keeps measuring payments only. */
function adjustBaseline(db: D1Database, ws: string, deltaVnd: number) {
  return db
    .prepare(
      `UPDATE goals SET target_vnd = MAX(0, target_vnd + ?),
              completed_at = CASE WHEN ? > 0 THEN NULL ELSE completed_at END
        WHERE workspace_id = ? AND kind = 'debt_freedom'`,
    )
    .bind(deltaVnd, deltaVnd, ws);
}

app.post('/debts', async (c) => {
  const { debts } = createDebtsBody.parse(await c.req.json());
  const db = c.env.DB;
  const ws = c.get('workspaceId');
  const rates = await loadRates(db);
  const ids: string[] = [];
  const stmts = debts.flatMap((d) => {
    if (d.currency !== 'VND' && !rates[d.currency]) {
      throw new HTTPException(400, { message: `Chưa có tỷ giá ${d.currency}, hãy đặt tỷ giá trước` });
    }
    const id = crypto.randomUUID();
    ids.push(id);
    return [
      db
        .prepare(
          `INSERT INTO debts (id, workspace_id, name, type, currency, balance_minor, monthly_fee_rate_bp, min_payment_minor,
                              statement_day, due_day, priority_order, aliases)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, ws, d.name, d.type, d.currency, d.balanceMinor, d.monthlyFeeRateBp, d.minPaymentMinor,
              d.statementDay, d.dueDay, d.priorityOrder, JSON.stringify(d.aliases)),
      adjustBaseline(db, ws, toVnd(d.balanceMinor, d.currency, rateFor(d.currency, rates))),
    ];
  });
  await db.batch(stmts);
  return c.json({ ids }, 201);
});

/** Close a debt that is paid off. It disappears from plans but keeps its history. */
app.post('/debts/:id/archive', async (c) => {
  const res = await c.env.DB.prepare(
    `UPDATE debts SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND workspace_id = ? AND archived_at IS NULL AND balance_minor = 0`,
  )
    .bind(c.req.param('id'), c.get('workspaceId'))
    .run();
  if (!res.meta.changes) throw new HTTPException(409, { message: 'Chỉ đóng được khoản nợ đã trả hết' });
  return c.json({ ok: true });
});

/** Delete a debt created by mistake. Refused once it has transactions. */
app.delete('/debts/:id', async (c) => {
  const db = c.env.DB;
  const ws = c.get('workspaceId');
  const id = c.req.param('id');
  const [debts, rates] = await Promise.all([loadDebts(db, ws), loadRates(db)]);
  const debt = debts.find((d) => d.id === id);
  if (!debt) throw new HTTPException(404, { message: 'Not found' });
  try {
    await db.batch([
      db.prepare('DELETE FROM debts WHERE id = ? AND workspace_id = ?').bind(id, ws),
      adjustBaseline(db, ws, -toVnd(debt.balanceMinor, debt.currency, rateFor(debt.currency, rates))),
    ]);
  } catch (e) {
    if (String(e).includes('FOREIGN KEY')) {
      throw new HTTPException(409, { message: 'Khoản nợ đã có giao dịch, hãy xoá giao dịch trước' });
    }
    throw e;
  }
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
const debtPatch = z
  .object({
    name: z.string().min(1).max(60),
    balanceMinor: z.number().int().min(0),
    monthlyFeeRateBp: z.number().int().min(0).max(10_000),
    minPaymentMinor: z.number().int().min(0),
    statementDay: z.number().int().min(1).max(31).nullable(),
    dueDay: z.number().int().min(1).max(31).nullable(),
    priorityOrder: z.number().int().nullable(),
    aliases: z.array(z.string().max(40)).max(20),
  })
  .partial();

const DEBT_COLUMNS: Record<keyof z.infer<typeof debtPatch>, string> = {
  name: 'name',
  balanceMinor: 'balance_minor',
  monthlyFeeRateBp: 'monthly_fee_rate_bp',
  minPaymentMinor: 'min_payment_minor',
  statementDay: 'statement_day',
  dueDay: 'due_day',
  priorityOrder: 'priority_order',
  aliases: 'aliases',
};

/** Edit debt settings. balanceMinor here is a manual reconciliation against the bank statement. */
app.patch('/debts/:id', async (c) => {
  const patch = debtPatch.parse(await c.req.json());
  const entries = Object.entries(patch) as [keyof typeof DEBT_COLUMNS, unknown][];
  if (!entries.length) throw new HTTPException(400, { message: 'Nothing to update' });
  const sets = entries.map(([k]) => `${DEBT_COLUMNS[k]} = ?`).join(', ');
  const values = entries.map(([k, v]) => (k === 'aliases' ? JSON.stringify(v) : v));
  const db = c.env.DB;
  const ws = c.get('workspaceId');
  const id = c.req.param('id');
  const [debts, rates] = await Promise.all([loadDebts(db, ws), loadRates(db)]);
  const debt = debts.find((d) => d.id === id);
  if (!debt) throw new HTTPException(404, { message: 'Not found' });

  const stmts = [
    db
      .prepare(`UPDATE debts SET ${sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ?`)
      .bind(...values, id, ws),
  ];
  // A manual balance correction (bank statement) moves the baseline too.
  if (patch.balanceMinor !== undefined && patch.balanceMinor !== debt.balanceMinor) {
    const rate = rateFor(debt.currency, rates);
    stmts.push(adjustBaseline(db, ws, toVnd(patch.balanceMinor, debt.currency, rate) - toVnd(debt.balanceMinor, debt.currency, rate)));
  }
  await db.batch(stmts);
  return c.json({ ok: true });
});

const budgetPatch = z
  .object({ name: z.string().trim().min(1).max(60), monthlyLimitVnd: z.number().int().min(0).nullable() })
  .partial();

app.patch('/budgets/:id', async (c) => {
  const p = budgetPatch.parse(await c.req.json());
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (p.name !== undefined) (sets.push('name = ?'), vals.push(p.name));
  if (p.monthlyLimitVnd !== undefined) (sets.push('monthly_limit_vnd = ?'), vals.push(p.monthlyLimitVnd));
  if (!sets.length) throw new HTTPException(400, { message: 'Nothing to update' });
  const res = await c.env.DB.prepare(`UPDATE budgets SET ${sets.join(', ')} WHERE id = ? AND workspace_id = ?`)
    .bind(...vals, c.req.param('id'), c.get('workspaceId'))
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: 'Not found' });
  return c.json({ ok: true });
});

app.get('/settings', async (c) => {
  const [monthlyDebtBudgetVnd, rates] = await Promise.all([
    loadMonthlyDebtBudget(c.env.DB, c.get('workspaceId'), c.env.MONTHLY_DEBT_BUDGET_VND),
    loadRates(c.env.DB),
  ]);
  const ef = await c.env.DB.prepare("SELECT target_vnd, monthly_target_vnd FROM goals WHERE workspace_id = ? AND kind = 'emergency_fund'")
    .bind(c.get('workspaceId'))
    .first<{ target_vnd: number; monthly_target_vnd: number | null }>();
  return c.json({
    monthlyDebtBudgetVnd,
    rates,
    emergencyFundTargetVnd: ef?.target_vnd ?? 0,
    emergencyFundMonthlyVnd: ef?.monthly_target_vnd ?? null,
  });
});

const settingsBody = z
  .object({
    monthlyDebtBudgetVnd: z.number().int().positive().max(10_000_000_000),
    emergencyFundTargetVnd: z.number().int().min(0).max(1_000_000_000_000),
    emergencyFundMonthlyVnd: z.number().int().positive().nullable(),
  })
  .partial();

app.put('/settings', async (c) => {
  const body = settingsBody.parse(await c.req.json());
  const db = c.env.DB;
  const ws = c.get('workspaceId');
  const stmts: D1PreparedStatement[] = [];
  if (body.monthlyDebtBudgetVnd !== undefined) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO settings (workspace_id, key, value) VALUES (?, 'monthly_debt_budget_vnd', ?)
           ON CONFLICT (workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        )
        .bind(ws, String(body.monthlyDebtBudgetVnd)),
      // keep the "Trả nợ" budget bucket in sync
      db.prepare(`UPDATE budgets SET monthly_limit_vnd = ? WHERE workspace_id = ? AND kind = 'debt'`).bind(body.monthlyDebtBudgetVnd, ws),
    );
  }
  if (body.emergencyFundTargetVnd !== undefined) {
    stmts.push(db.prepare("UPDATE goals SET target_vnd = ? WHERE workspace_id = ? AND kind = 'emergency_fund'").bind(body.emergencyFundTargetVnd, ws));
  }
  if (body.emergencyFundMonthlyVnd !== undefined) {
    stmts.push(
      db.prepare("UPDATE goals SET monthly_target_vnd = ? WHERE workspace_id = ? AND kind = 'emergency_fund'").bind(body.emergencyFundMonthlyVnd, ws),
      db.prepare(`UPDATE budgets SET monthly_limit_vnd = ? WHERE workspace_id = ? AND kind = 'savings'`).bind(body.emergencyFundMonthlyVnd, ws),
    );
  }
  if (!stmts.length) throw new HTTPException(400, { message: 'Nothing to update' });
  await db.batch(stmts);
  return c.json({ ok: true });
});

const fxBody = z.object({ rateVnd: z.number().int().positive() });

/** Exchange rates are shared by every workspace. */
app.put('/fx/:currency', async (c) => {
  const currency = z.enum(['USD', 'USDT']).parse(c.req.param('currency'));
  const { rateVnd } = fxBody.parse(await c.req.json());
  await c.env.DB.prepare(
    `INSERT INTO fx_rates (currency, rate_vnd) VALUES (?, ?)
     ON CONFLICT (currency) DO UPDATE SET rate_vnd = excluded.rate_vnd,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(currency, rateVnd)
    .run();
  return c.json({ ok: true });
});

app.route('/', org);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
