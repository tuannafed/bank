import { toMinor, type Currency } from '@bank/core';

const UNITS: [RegExp, number][] = [
  [/(tỷ|ty|tỉ|b)$/, 1e9],
  [/(triệu|trieu|tr|m|củ)$/, 1e6],
  [/(nghìn|ngàn|k)$/, 1e3],
];

/**
 * Parse what people actually type: "28tr", "1tr2", "500k", "28.000.000", "1150.5".
 * Returns minor units or null when it cannot be read.
 */
export function parseAmountInput(raw: string, currency: Currency): number | null {
  let s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  if (currency === 'VND') {
    // "1tr2" -> 1.2tr
    const mixed = s.match(/^(\d+)(tr|triệu|trieu|tỷ|ty|tỉ)(\d+)$/);
    if (mixed) s = `${mixed[1]}.${mixed[3]}${mixed[2]}`;
    for (const [re, mul] of UNITS) {
      if (re.test(s)) {
        const n = Number(s.replace(re, '').replace(',', '.'));
        return Number.isFinite(n) && n > 0 ? Math.round(n * mul) : null;
      }
    }
    const digits = s.replace(/[.,]/g, '');
    return /^\d+$/.test(digits) && Number(digits) > 0 ? Number(digits) : null;
  }
  try {
    const v = toMinor(s.replace(/,/g, ''), currency);
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}
