import type { Currency, FxRates } from './money';
import type { RoadmapStatus } from './roadmap';
import type { Budget, DebtType, Goal, TransactionDraft } from './types';
import type { ParseResult } from './parser';

/** API response shapes shared by the Worker and the PWA. */

export interface DebtView {
  id: string;
  name: string;
  type: DebtType;
  currency: Currency;
  balanceMinor: number;
  balanceVnd: number;
  monthlyFeeRateBp: number;
  priorityOrder: number | null;
  /** Position in payoff order, 1 = pay first. */
  payoffRank: number;
  paidThisMonthVnd: number;
  /** All payments ever made to this debt (VND at current rate). */
  paidTotalVnd: number;
  /** Fee expected on the balance left after this month's payments. */
  estimatedFeeVnd: number;
  /** Fee avoided by this month's payments. */
  feeSavedVnd: number;
  nextStatement: { date: string; daysUntil: number } | null;
  nextDue: { date: string; daysUntil: number } | null;
  /** YYYY-MM the plan clears this debt, null if not feasible. */
  projectedPayoffMonth: string | null;
}

export interface DashboardResponse {
  today: string;
  rates: FxRates;
  roadmap: RoadmapStatus;
  totalDebtVnd: number;
  monthlyDebtBudgetVnd: number;
  paidThisMonthVnd: number;
  feeSavedThisMonthVnd: number;
  estimatedFeeThisMonthVnd: number;
  debts: DebtView[];
  plan: {
    feasible: boolean;
    reason: string | null;
    debtFreeMonth: string | null;
    monthsToDebtFree: number | null;
    totalFeesVnd: number;
  };
  /** Month-by-month payments per debt from the avalanche plan (VND). */
  timeline: { month: string; paidByDebt: Record<string, number> }[];
  goals: Goal[];
  budgets: (Budget & { spentThisMonthVnd: number })[];
}

export type ParseResponse = ParseResult;

export interface CreateTransactionsRequest {
  transactions: Omit<TransactionDraft, 'amountVnd' | 'debtAmountMinor'>[];
}

export interface TransactionView {
  id: string;
  type: TransactionDraft['type'];
  currency: Currency;
  amountMinor: number;
  fxRateVnd: number;
  amountVnd: number;
  debtId: string | null;
  debtAmountMinor: number | null;
  budgetId: string | null;
  goalId: string | null;
  occurredOn: string;
  note: string;
  source: 'manual' | 'ai';
  createdAt: string;
  /** Who logged it (useful in shared workspaces). */
  createdByName: string | null;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  kind: 'personal' | 'shared';
  role: 'owner' | 'member';
  memberCount: number;
}

export interface MeResponse {
  user: { id: string; email: string; name: string; isAdmin: boolean };
  workspaces: WorkspaceSummary[];
}

export interface MemberView {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'member';
}

export interface AdminUserView {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: string;
}
