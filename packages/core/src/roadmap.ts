export type Phase = 'debt_freedom' | 'emergency_fund' | 'complete';

export interface RoadmapInput {
  totalDebtVnd: number;
  /** Total debt (VND) when the plan started; progress is measured against it. */
  baselineDebtVnd: number;
  emergencyFund: { currentVnd: number; targetVnd: number; monthlyTargetVnd: number | null };
}

export interface RoadmapStatus {
  phase: Phase;
  /** 0..1 for the active phase. */
  progress: number;
  currentVnd: number;
  targetVnd: number;
  remainingVnd: number;
  /** Months left at the monthly target (emergency fund only). */
  monthsLeft: number | null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function computeRoadmap({ totalDebtVnd, baselineDebtVnd, emergencyFund: ef }: RoadmapInput): RoadmapStatus {
  if (totalDebtVnd > 0) {
    // Fees can push debt above the baseline; never show negative progress.
    const baseline = Math.max(baselineDebtVnd, totalDebtVnd);
    return {
      phase: 'debt_freedom',
      progress: clamp01(1 - totalDebtVnd / baseline),
      currentVnd: baseline - totalDebtVnd,
      targetVnd: baseline,
      remainingVnd: totalDebtVnd,
      monthsLeft: null,
    };
  }
  // No fund target yet (new workspace): stay in phase 2 so the UI asks for one.
  if (ef.targetVnd <= 0) {
    return { phase: 'emergency_fund', progress: 0, currentVnd: ef.currentVnd, targetVnd: 0, remainingVnd: 0, monthsLeft: null };
  }
  const remainingVnd = Math.max(0, ef.targetVnd - ef.currentVnd);
  return {
    phase: remainingVnd === 0 ? 'complete' : 'emergency_fund',
    progress: ef.targetVnd > 0 ? clamp01(ef.currentVnd / ef.targetVnd) : 1,
    currentVnd: ef.currentVnd,
    targetVnd: ef.targetVnd,
    remainingVnd,
    monthsLeft: ef.monthlyTargetVnd ? Math.ceil(remainingVnd / ef.monthlyTargetVnd) : null,
  };
}

/** Today's date (YYYY-MM-DD) in Vietnam, regardless of server timezone. */
export function todayVn(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Next occurrence (today included) of a day-of-month. Day 31 in a 30-day month
 * clamps to the 30th, as banks do.
 */
export function nextDayOfMonth(day: number, today: string): { date: string; daysUntil: number } {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error(`Invalid day ${day}`);
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  let ty = y;
  let tm = m;
  let td = Math.min(day, daysInMonth(ty, tm));
  if (td < d) {
    tm += 1;
    if (tm > 12) { tm = 1; ty += 1; }
    td = Math.min(day, daysInMonth(ty, tm));
  }
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d);
  return { date: isoDate(ty, tm, td), daysUntil: Math.round(ms / 86_400_000) };
}
