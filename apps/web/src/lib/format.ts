import type { DebtView } from '@bank/core';

const DEBT_COLORS = ['var(--debt-1)', 'var(--debt-2)', 'var(--debt-3)', 'var(--debt-4)', 'var(--debt-5)'];

/** One colour per debt, by payoff order. Paid-off debts go grey. */
export function debtColor(debt: Pick<DebtView, 'payoffRank'>): string {
  if (debt.payoffRank <= 0) return 'var(--muted)';
  return DEBT_COLORS[(debt.payoffRank - 1) % DEBT_COLORS.length]!;
}

/** "2026-11" -> "T11", January also shows the year: "T1/27" */
export function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-');
  return m === '01' ? `T1/${y!.slice(2)}` : `T${Number(m)}`;
}

/** "2027-05" -> "5/2027" */
export function monthShort(yyyyMm: string | null): string {
  if (!yyyyMm) return '—';
  const [y, m] = yyyyMm.split('-');
  return `${Number(m)}/${y}`;
}

/** "2026-11-25" -> "25/11" */
export const ddmm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(now));
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}
