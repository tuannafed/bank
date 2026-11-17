import type { Currency } from './money';

export type DebtType = 'credit_card' | 'personal_loan' | 'friend_debt';

export interface Debt {
  id: string;
  name: string;
  type: DebtType;
  currency: Currency;
  /** Current outstanding balance in minor units of `currency`. */
  balanceMinor: number;
  /** Monthly rollover/installment fee in basis points: 200 = 2.00%/month. */
  monthlyFeeRateBp: number;
  /** Minimum payment per month in minor units of `currency` (0 = none). */
  minPaymentMinor: number;
  /** 1-31, null when not applicable (friend debts). */
  statementDay: number | null;
  dueDay: number | null;
  /** Manual override. Non-null values are paid first (ascending), before avalanche order. */
  priorityOrder: number | null;
  aliases: string[];
}

export const TRANSACTION_TYPES = ['income', 'expense', 'debt_payment', 'debt_fee', 'savings_contribution'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Payload accepted by POST /api/transactions. Mirrors the `transactions` table. */
export interface TransactionDraft {
  type: TransactionType;
  currency: Currency;
  amountMinor: number;
  /** VND per 1 major unit. Always 1 for VND. */
  fxRateVnd: number;
  /** Derived for display; the DB recomputes it as a generated column. */
  amountVnd: number;
  debtId: string | null;
  /** Amount applied to the debt, in the debt's own currency minor units. */
  debtAmountMinor: number | null;
  budgetId: string | null;
  goalId: string | null;
  /** YYYY-MM-DD in Asia/Ho_Chi_Minh. */
  occurredOn: string;
  note: string;
  source: 'manual' | 'ai';
  rawInput: string | null;
}

export interface Budget {
  id: string;
  /** Stable meaning across workspaces (rent, car, …); drives the icon. */
  slug: string | null;
  name: string;
  kind: 'fixed' | 'support' | 'living' | 'growth' | 'debt' | 'savings';
  monthlyLimitVnd: number | null;
}

export interface Goal {
  id: string;
  kind: 'debt_freedom' | 'emergency_fund';
  name: string;
  targetVnd: number;
  monthlyTargetVnd: number | null;
  currentVnd: number;
  completedAt: string | null;
}

/** A debt the AI (or a form) proposes to create. Mirrors POST /api/debts. */
export interface NewDebtDraft {
  name: string;
  type: DebtType;
  currency: Currency;
  balanceMinor: number;
  monthlyFeeRateBp: number;
  minPaymentMinor: number;
  statementDay: number | null;
  dueDay: number | null;
  priorityOrder: number | null;
  aliases: string[];
}
