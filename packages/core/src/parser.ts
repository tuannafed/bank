import { z } from 'zod';
import { CURRENCIES, fromVnd, rateFor, toMinor, toVnd, type Currency, type FxRates } from './money';
import { TRANSACTION_TYPES, type Budget, type Debt, type Goal, type NewDebtDraft, type TransactionDraft } from './types';

/** Shape the LLM must return. Amounts are decimal strings in MAJOR units. */
export const llmOutputSchema = z.object({
  transactions: z
    .array(
      z.object({
        type: z.enum(TRANSACTION_TYPES),
        amount: z.union([z.string(), z.number()]),
        currency: z.enum(CURRENCIES),
        fx_rate_vnd: z.number().positive().nullable(),
        debt_ref: z.string().nullable(),
        budget_ref: z.string().nullable(),
        goal_ref: z.string().nullable(),
        occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        note: z.string(),
      }),
    )
    .max(10),
  new_debts: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(['credit_card', 'personal_loan', 'friend_debt']),
        currency: z.enum(CURRENCIES),
        balance: z.union([z.string(), z.number()]),
        monthly_fee_rate_pct: z.number().min(0).max(100),
        statement_day: z.number().int().nullable(),
        due_day: z.number().int().nullable(),
        aliases: z.array(z.string()).default([]),
      }),
    )
    .max(5)
    .default([]),
  warnings: z.array(z.string()),
  needs_clarification: z.string().nullable(),
});
export type LlmOutput = z.infer<typeof llmOutputSchema>;

export interface ParserContext {
  today: string;
  debts: Debt[];
  budgets: Budget[];
  goals: Goal[];
  rates: FxRates;
}

/**
 * Any chat-completion backend: returns the raw assistant message content.
 * `imageDataUrl` (data:image/jpeg;base64,...) is attached to the user message when present.
 */
export type LlmComplete = (req: { system: string; user: string; imageDataUrl?: string }) => Promise<string>;

export interface ParseInput {
  text?: string;
  /** data:image/(jpeg|png|webp);base64,... */
  imageDataUrl?: string;
}

export interface ParseResult {
  drafts: TransactionDraft[];
  newDebts: NewDebtDraft[];
  warnings: string[];
  needsClarification: string | null;
}

export function buildParserSystemPrompt(ctx: ParserContext): string {
  const debts = ctx.debts.map((d) => ({ id: d.id, name: d.name, aliases: d.aliases, currency: d.currency }));
  const budgets = ctx.budgets.map((b) => ({ id: b.id, name: b.name }));
  const goals = ctx.goals.map((g) => ({ id: g.id, kind: g.kind, name: g.name }));

  return `You convert a personal-finance log line (Vietnamese or English) into JSON transactions.
Output ONLY a JSON object, no prose, matching exactly:
{"transactions":[{"type":"income|expense|debt_payment|debt_fee|savings_contribution","amount":"<decimal string, major units>","currency":"VND|USD|USDT","fx_rate_vnd":<number|null>,"debt_ref":"<debt id|null>","budget_ref":"<budget id|null>","goal_ref":"<goal id|null>","occurred_on":"YYYY-MM-DD|null","note":"<short note in the user's language>"}],"new_debts":[{"name":"<short name>","type":"credit_card|personal_loan|friend_debt","currency":"VND|USD|USDT","balance":"<decimal string>","monthly_fee_rate_pct":<number, 2 means 2%/month>,"statement_day":<1-31|null>,"due_day":<1-31|null>,"aliases":["<other names the user may type>"]}],"warnings":["..."],"needs_clarification":"<question|null>"}

RULES
1. One sentence may contain several transactions. Emit them in the order they happen.
2. Vietnamese amounts: "k"/"nghìn"/"ngàn" = 1,000; "tr"/"triệu"/"củ" = 1,000,000; "tỷ"/"tỏi" = 1,000,000,000; "lít" = 100,000. "1tr2" = 1,200,000. "2 tỷ rưỡi" = 2,500,000,000. Write the final number with no separators, e.g. "28000000".
3. Currency: a number with "USDT"/"U"/"usdt" is USDT; "$"/"USD"/"đô" is USD; otherwise VND.
4. fx_rate_vnd: the VND per 1 unit the user states ("tỷ giá 25950", "rate 25.95k" = 25950). If not stated for a USD/USDT transaction, use null (the app fills the latest rate). Always null for VND.
5. type:
   - income: salary ("lương"), freelance, money received ("nhận", "về").
   - debt_payment: paying a debt ("trả thẻ", "trả nợ", "thanh toán thẻ"). debt_ref MUST be an id from DEBTS. If the target is unclear, set debt_ref null and ask in needs_clarification.
   - debt_fee: a fee/interest the bank charged on a debt ("phí chuyển đổi trả góp", "phí rollover", "lãi thẻ"). debt_ref MUST be an id from DEBTS. It increases the debt.
   - savings_contribution: putting money into a goal ("bỏ quỹ", "tiết kiệm", "gửi quỹ khẩn cấp"). goal_ref MUST be an id from GOALS.
   - expense: everything spent. budget_ref = best matching id from BUDGETS, or null.
6. "trích X trả Y" after an income means a separate debt_payment of X; it does not change the income amount.
7. occurred_on: resolve "hôm nay"/"today" = ${ctx.today}, "hôm qua"/"yesterday" = the day before, explicit dates in the current year unless stated. null if not mentioned.
8. NEW DEBTS: only when the user explicitly adds a debt that is not in DEBTS ("thêm nợ", "thêm thẻ", "vay thêm", "mượn của X"). Put it in new_debts, never in transactions. Use 0 fee for friend debts unless stated. Leave days null if not stated. If the debt already exists in DEBTS, do not add it again; mention it in warnings.
9. IMAGES: the user may attach a screenshot of a Vietnamese bank transfer receipt (e.g. "Chuyển tiền thành công", "Giao dịch thành công") or a bill. Read: amount ("Số tiền"), recipient name/account/bank ("Người nhận", "Tài khoản nhận", "Ngân hàng"), transfer content ("Nội dung"), and date/time.
   - Recipient or content matches a debt name/alias (a credit card bank such as VPBank/HSBC, or a friend's name) → debt_payment to that debt.
   - Otherwise a transfer out → expense; money received → income.
   - occurred_on = the receipt date. note = recipient + content, short.
   - If the amount is unreadable or the image is not a receipt/bill, return no transactions and ask in needs_clarification. Never guess digits.
   - Text sent together with the image is extra context from the user and wins over the image when they conflict.
10. Never invent ids, amounts or rates. If the line is not a transaction, return "transactions": [] and explain in needs_clarification.
11. Put anything ambiguous you resolved by assumption into warnings (in the user's language).

TODAY: ${ctx.today}
DEBTS: ${JSON.stringify(debts)}
BUDGETS: ${JSON.stringify(budgets)}
GOALS: ${JSON.stringify(goals)}

EXAMPLE
Input: "Vừa nhận 1150 USDT tỷ giá 25950, trích 28 triệu trả thẻ VPBank"
Output: {"transactions":[{"type":"income","amount":"1150","currency":"USDT","fx_rate_vnd":25950,"debt_ref":null,"budget_ref":null,"goal_ref":null,"occurred_on":null,"note":"Nhận 1150 USDT"},{"type":"debt_payment","amount":"28000000","currency":"VND","fx_rate_vnd":null,"debt_ref":"<id of VPBank>","budget_ref":null,"goal_ref":null,"occurred_on":null,"note":"Trả thẻ VPBank"}],"warnings":[],"needs_clarification":null}`;
}

/** Strip ```json fences some models add despite JSON mode. */
function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(trimmed);
}

/**
 * Turn the validated LLM output into insert-ready drafts.
 * All ids, rates and minor-unit conversions are checked here, not trusted from the model.
 */
export function normalizeLlmOutput(out: LlmOutput, ctx: ParserContext, rawInput: string): ParseResult {
  const warnings = [...out.warnings];
  const drafts: TransactionDraft[] = [];
  const debtById = new Map(ctx.debts.map((d) => [d.id, d]));
  const budgetIds = new Set(ctx.budgets.map((b) => b.id));
  const goalIds = new Set(ctx.goals.map((g) => g.id));
  // A rate stated in this message applies to later lines in the same message.
  const rates: FxRates = { ...ctx.rates };

  out.transactions.forEach((t, i) => {
    const label = `#${i + 1} (${t.note || t.type})`;
    const currency: Currency = t.currency;

    let amountMinor: number;
    try {
      amountMinor = toMinor(t.amount, currency);
    } catch (e) {
      warnings.push(`${label}: số tiền không hợp lệ "${t.amount}" - bỏ qua`);
      return;
    }
    if (amountMinor <= 0) {
      warnings.push(`${label}: số tiền phải > 0 - bỏ qua`);
      return;
    }

    let fxRateVnd = 1;
    if (currency !== 'VND') {
      if (t.fx_rate_vnd) {
        fxRateVnd = Math.round(t.fx_rate_vnd);
        rates[currency] = fxRateVnd;
      } else if (rates[currency]) {
        fxRateVnd = rates[currency]!;
        warnings.push(`${label}: dùng tỷ giá gần nhất ${fxRateVnd.toLocaleString('vi-VN')} VND/${currency}`);
      } else {
        warnings.push(`${label}: thiếu tỷ giá ${currency} - bỏ qua`);
        return;
      }
    }
    const amountVnd = toVnd(amountMinor, currency, fxRateVnd);

    let debtId: string | null = null;
    let debtAmountMinor: number | null = null;
    if (t.type === 'debt_payment' || t.type === 'debt_fee') {
      const debt = t.debt_ref ? debtById.get(t.debt_ref) : undefined;
      if (!debt) {
        warnings.push(`${label}: không xác định được khoản nợ - bỏ qua`);
        return;
      }
      debtId = debt.id;
      debtAmountMinor =
        debt.currency === currency
          ? amountMinor
          : fromVnd(amountVnd, debt.currency, rateFor(debt.currency, rates));
      if (t.type === 'debt_payment' && debtAmountMinor > debt.balanceMinor) {
        warnings.push(`${label}: số trả vượt dư nợ ${debt.name}; sẽ bị từ chối khi lưu`);
      }
    }

    let goalId: string | null = null;
    if (t.type === 'savings_contribution') {
      if (!t.goal_ref || !goalIds.has(t.goal_ref)) {
        warnings.push(`${label}: không xác định được quỹ - bỏ qua`);
        return;
      }
      goalId = t.goal_ref;
    }

    const budgetId = t.budget_ref && budgetIds.has(t.budget_ref) ? t.budget_ref : null;

    drafts.push({
      type: t.type,
      currency,
      amountMinor,
      fxRateVnd,
      amountVnd,
      debtId,
      debtAmountMinor,
      budgetId,
      goalId,
      occurredOn: t.occurred_on ?? ctx.today,
      note: t.note.slice(0, 200),
      source: 'ai',
      rawInput,
    });
  });

  const existing = new Set(ctx.debts.map((d) => d.name.trim().toLowerCase()));
  const newDebts: NewDebtDraft[] = [];
  out.new_debts.forEach((d, i) => {
    const name = d.name.trim().slice(0, 60);
    const label = `Nợ mới #${i + 1} (${name || '?'})`;
    if (!name) return warnings.push(`${label}: thiếu tên - bỏ qua`);
    if (existing.has(name.toLowerCase())) return warnings.push(`${label}: đã có khoản nợ này - bỏ qua`);
    let balanceMinor: number;
    try {
      balanceMinor = toMinor(d.balance, d.currency);
    } catch {
      return warnings.push(`${label}: dư nợ không hợp lệ "${d.balance}" - bỏ qua`);
    }
    const day = (v: number | null) => (v !== null && v >= 1 && v <= 31 ? v : null);
    newDebts.push({
      name,
      type: d.type,
      currency: d.currency,
      balanceMinor,
      monthlyFeeRateBp: Math.round(d.monthly_fee_rate_pct * 100),
      minPaymentMinor: 0,
      statementDay: day(d.statement_day),
      dueDay: day(d.due_day),
      priorityOrder: null,
      aliases: d.aliases.map((a) => a.trim().slice(0, 40)).filter(Boolean).slice(0, 10),
    });
  });

  return { drafts, newDebts, warnings, needsClarification: out.needs_clarification };
}

/**
 * Parse a natural-language log line into transaction drafts.
 * Drafts are NOT persisted; the app shows them for confirmation first.
 */
export async function parseNaturalLanguageTransaction(
  input: string | ParseInput,
  ctx: ParserContext,
  complete: LlmComplete,
): Promise<ParseResult> {
  const { text = '', imageDataUrl } = typeof input === 'string' ? { text: input } : input;
  const trimmed = text.trim();
  if (!trimmed && !imageDataUrl) throw new Error('Empty input');
  if (trimmed.length > 500) throw new Error('Input too long (max 500 chars)');
  if (imageDataUrl && !/^data:image\/(jpeg|png|webp|gif);base64,/.test(imageDataUrl)) {
    throw new Error('Unsupported image format');
  }

  const user = trimmed || 'Đọc ảnh đính kèm và ghi nhận giao dịch.';
  const raw = await complete({ system: buildParserSystemPrompt(ctx), user, ...(imageDataUrl ? { imageDataUrl } : {}) });
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch {
    throw new Error('LLM returned invalid JSON');
  }
  const parsed = llmOutputSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`LLM output failed validation: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
  }
  return normalizeLlmOutput(parsed.data, ctx, imageDataUrl ? `[ảnh] ${trimmed}`.trim() : trimmed);
}
