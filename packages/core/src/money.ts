export const CURRENCIES = ['VND', 'USD', 'USDT'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Minor units per 1 major unit. VND has no minor unit; USD/USDT are stored in cents. */
export const SCALE: Record<Currency, number> = { VND: 1, USD: 100, USDT: 100 };

/** VND per 1 major unit of a currency. VND is always 1. */
export type FxRates = Partial<Record<Currency, number>>;

/**
 * Parse a decimal amount ("1150", "1150.5", 28000000) into integer minor units.
 * Never goes through float multiplication, so "0.1" USDT is exactly 10.
 */
export function toMinor(amount: string | number, currency: Currency): number {
  const raw = typeof amount === 'number' ? amount.toString() : amount.trim().replace(/[,_\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`Invalid amount: ${amount}`);
  const [intPart = '0', fracPart = ''] = raw.split('.');
  const decimals = Math.log10(SCALE[currency]);
  if (fracPart.length > decimals && /[1-9]/.test(fracPart.slice(decimals))) {
    throw new Error(`Amount ${amount} has more precision than ${currency} allows`);
  }
  const minor = Number(intPart) * SCALE[currency] + Number(fracPart.slice(0, decimals).padEnd(decimals, '0') || 0);
  if (!Number.isSafeInteger(minor)) throw new Error(`Amount ${amount} out of range`);
  return minor;
}

export function fromMinor(minor: number, currency: Currency): number {
  return minor / SCALE[currency];
}

/**
 * Convert minor units to VND. MUST stay identical to the `amount_vnd`
 * generated column in migrations/0001_init.sql (round half up).
 */
export function toVnd(minor: number, currency: Currency, fxRateVnd: number): number {
  if (currency === 'VND') return minor;
  return Math.floor((minor * fxRateVnd + SCALE[currency] / 2) / SCALE[currency]);
}

/** Convert a VND amount into minor units of `currency` (round half up). */
export function fromVnd(vnd: number, currency: Currency, fxRateVnd: number): number {
  if (currency === 'VND') return vnd;
  return Math.floor((vnd * SCALE[currency]) / fxRateVnd + 0.5);
}

export function rateFor(currency: Currency, rates: FxRates): number {
  if (currency === 'VND') return 1;
  const r = rates[currency];
  if (!r || r <= 0) throw new Error(`Missing FX rate for ${currency}`);
  return r;
}

const vndFmt = new Intl.NumberFormat('vi-VN');

export function formatVnd(vnd: number): string {
  return `${vndFmt.format(Math.round(vnd))} ₫`;
}

/** 165_000_000 -> "165tr", 1_250_000_000 -> "1,25 tỷ" */
export function formatVndShort(vnd: number): string {
  const abs = Math.abs(vnd);
  if (abs >= 1e9) return `${(vnd / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (abs >= 1e6) return `${(vnd / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`;
  if (abs >= 1e3) return `${Math.round(vnd / 1e3)}k`;
  return `${vnd}`;
}

export function formatMinor(minor: number, currency: Currency): string {
  if (currency === 'VND') return formatVnd(minor);
  return `${fromMinor(minor, currency).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}
