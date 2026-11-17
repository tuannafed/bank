import type { Budget, Currency, Debt, FxRates, Goal } from '@bank/core';

interface DebtRow {
  id: string;
  name: string;
  type: Debt['type'];
  currency: Currency;
  balance_minor: number;
  monthly_fee_rate_bp: number;
  min_payment_minor: number;
  statement_day: number | null;
  due_day: number | null;
  priority_order: number | null;
  aliases: string;
}

export interface TransactionRow {
  id: string;
  created_by_name: string | null;
  type: string;
  currency: Currency;
  amount_minor: number;
  fx_rate_vnd: number;
  amount_vnd: number;
  debt_id: string | null;
  debt_amount_minor: number | null;
  budget_id: string | null;
  goal_id: string | null;
  occurred_on: string;
  note: string;
  source: string;
  created_at: string;
}

const toDebt = (r: DebtRow): Debt => ({
  id: r.id,
  name: r.name,
  type: r.type,
  currency: r.currency,
  balanceMinor: r.balance_minor,
  monthlyFeeRateBp: r.monthly_fee_rate_bp,
  minPaymentMinor: r.min_payment_minor,
  statementDay: r.statement_day,
  dueDay: r.due_day,
  priorityOrder: r.priority_order,
  aliases: JSON.parse(r.aliases) as string[],
});

export async function loadDebts(db: D1Database, ws: string): Promise<Debt[]> {
  const { results } = await db
    .prepare('SELECT * FROM debts WHERE workspace_id = ? AND archived_at IS NULL ORDER BY created_at')
    .bind(ws)
    .all<DebtRow>();
  return results.map(toDebt);
}

export async function loadRates(db: D1Database): Promise<FxRates> {
  const { results } = await db.prepare('SELECT currency, rate_vnd FROM fx_rates').all<{ currency: Currency; rate_vnd: number }>();
  return Object.fromEntries(results.map((r) => [r.currency, r.rate_vnd])) as FxRates;
}

export async function loadBudgets(db: D1Database, ws: string): Promise<Budget[]> {
  const { results } = await db
    .prepare('SELECT id, slug, name, kind, monthly_limit_vnd FROM budgets WHERE workspace_id = ? ORDER BY sort_order')
    .bind(ws)
    .all<{ id: string; slug: string | null; name: string; kind: Budget['kind']; monthly_limit_vnd: number | null }>();
  return results.map((r) => ({ id: r.id, slug: r.slug, name: r.name, kind: r.kind, monthlyLimitVnd: r.monthly_limit_vnd }));
}

export async function loadGoals(db: D1Database, ws: string): Promise<Goal[]> {
  const { results } = await db
    .prepare('SELECT id, kind, name, target_vnd, monthly_target_vnd, current_vnd, completed_at FROM goals WHERE workspace_id = ?')
    .bind(ws)
    .all<{
      id: string; kind: Goal['kind']; name: string; target_vnd: number;
      monthly_target_vnd: number | null; current_vnd: number; completed_at: string | null;
    }>();
  return results.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    targetVnd: r.target_vnd,
    monthlyTargetVnd: r.monthly_target_vnd,
    currentVnd: r.current_vnd,
    completedAt: r.completed_at,
  }));
}

/** Amount paid per debt (in the debt's minor units) since `fromDate` (inclusive). */
export async function debtPaymentsSince(db: D1Database, ws: string, fromDate: string): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT debt_id, SUM(debt_amount_minor) AS paid
         FROM transactions
        WHERE workspace_id = ? AND type = 'debt_payment' AND occurred_on >= ?
        GROUP BY debt_id`,
    )
    .bind(ws, fromDate)
    .all<{ debt_id: string; paid: number }>();
  return Object.fromEntries(results.map((r) => [r.debt_id, r.paid]));
}

/** Spend per budget since `fromDate`. */
export async function budgetSpendSince(db: D1Database, ws: string, fromDate: string): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT budget_id, SUM(amount_vnd) AS spent
         FROM transactions
        WHERE workspace_id = ? AND budget_id IS NOT NULL AND type = 'expense' AND occurred_on >= ?
        GROUP BY budget_id`,
    )
    .bind(ws, fromDate)
    .all<{ budget_id: string; spent: number }>();
  return Object.fromEntries(results.map((r) => [r.budget_id, r.spent]));
}

export async function loadMonthlyDebtBudget(db: D1Database, ws: string, fallback: string): Promise<number> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE workspace_id = ? AND key = 'monthly_debt_budget_vnd'")
    .bind(ws)
    .first<{ value: string }>();
  const n = Number(row?.value ?? fallback);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('monthly_debt_budget_vnd is invalid');
  return n;
}
