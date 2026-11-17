import { CURRENCIES, toVnd, type Currency, type DashboardResponse, type TransactionDraft } from '@bank/core';
import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useCreateTransactions } from '@/lib/api';
import { parseAmountInput } from '@/lib/amount';
import { cn } from '@/lib/utils';
import { AmountInput } from './AmountInput';
import { TX_META } from './HistoryView';

const TYPES: TransactionDraft['type'][] = ['expense', 'income', 'debt_payment', 'debt_fee', 'savings_contribution'];

export function ManualTxForm({ dashboard, onDone }: { dashboard: DashboardResponse; onDone: () => void }) {
  const [type, setType] = useState<TransactionDraft['type']>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('VND');
  const [fx, setFx] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState(dashboard.today);
  const [note, setNote] = useState('');
  const create = useCreateTransactions();

  const needsDebt = type === 'debt_payment' || type === 'debt_fee';
  const needsGoal = type === 'savings_contribution';
  const targets = needsDebt
    ? dashboard.debts.filter((d) => type === 'debt_fee' || d.balanceMinor > 0).map((d) => ({ id: d.id, name: d.name }))
    : needsGoal
      ? dashboard.goals.filter((g) => g.kind === 'emergency_fund').map((g) => ({ id: g.id, name: g.name }))
      : type === 'expense'
        ? dashboard.budgets.map((b) => ({ id: b.id, name: b.name }))
        : [];

  const defaultFx = currency === 'VND' ? 1 : (dashboard.rates[currency] ?? 0);
  const fxRate = currency === 'VND' ? 1 : Number(fx.replace(/\D/g, '')) || defaultFx;
  const amountMinor = parseAmountInput(amount, currency);
  const targetRequired = needsDebt || needsGoal;
  const valid = amountMinor !== null && fxRate > 0 && (!targetRequired || target !== '') && date !== '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || amountMinor === null) return;
    const draft: TransactionDraft = {
      type,
      currency,
      amountMinor,
      fxRateVnd: fxRate,
      amountVnd: toVnd(amountMinor, currency, fxRate),
      debtId: needsDebt ? target : null,
      debtAmountMinor: null,
      budgetId: type === 'expense' && target ? target : null,
      goalId: needsGoal ? target : null,
      occurredOn: date,
      note: note.trim(),
      source: 'manual',
      rawInput: null,
    };
    await create.mutateAsync([draft]);
    toast.success(`Đã lưu: ${TX_META[type].label.toLowerCase()}`);
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Loại giao dịch">
        {TYPES.map((t) => {
          const Icon = TX_META[t].icon;
          const active = t === type;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setType(t);
                setTarget('');
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground',
              )}
            >
              <Icon className="size-4" /> {TX_META[t].label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-[1fr_6.5rem] gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="m-amount">Số tiền</Label>
          <AmountInput id="m-amount" value={amount} onChange={setAmount} currency={currency} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-cur">Loại tiền</Label>
          <NativeSelect id="m-cur" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {currency !== 'VND' && (
        <div className="space-y-1.5">
          <Label htmlFor="m-fx">Tỷ giá (VND / 1 {currency})</Label>
          <Input id="m-fx" inputMode="numeric" value={fx} onChange={(e) => setFx(e.target.value)} placeholder={String(defaultFx || 'Vd: 25950')} />
        </div>
      )}

      {targets.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="m-target">{needsDebt ? 'Khoản nợ' : needsGoal ? 'Quỹ' : 'Mục ngân sách (không bắt buộc)'}</Label>
          <NativeSelect id="m-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{targetRequired ? 'Chọn…' : 'Không chọn'}</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="m-date">Ngày</Label>
          <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-note">Ghi chú</Label>
          <Input id="m-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Không bắt buộc" />
        </div>
      </div>

      {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={!valid || create.isPending}>
        {create.isPending && <Loader2 className="animate-spin" />} Lưu giao dịch
      </Button>
    </form>
  );
}
