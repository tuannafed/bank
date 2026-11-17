import { CURRENCIES, fromMinor, type Currency, type Debt, type DebtType } from '@bank/core';
import { Archive, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useArchiveDebt, useCreateDebts, useDeleteDebt, usePatchDebt } from '@/lib/api';
import { parseAmountInput } from '@/lib/amount';
import { AmountInput } from './AmountInput';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this debt; create a new one when undefined. */
  debt?: Debt;
}

const minorToInput = (minor: number, c: Currency) => (minor ? String(fromMinor(minor, c)) : '');
const dayOrNull = (s: string) => {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

export function DebtFormDrawer({ open, onOpenChange, debt }: Props) {
  const editing = !!debt;
  const [name, setName] = useState('');
  const [type, setType] = useState<DebtType>('credit_card');
  const [currency, setCurrency] = useState<Currency>('VND');
  const [balance, setBalance] = useState('');
  const [rate, setRate] = useState('');
  const [minPay, setMinPay] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [pinned, setPinned] = useState(false);
  const [aliases, setAliases] = useState('');
  const create = useCreateDebts();
  const patch = usePatchDebt();
  const archive = useArchiveDebt();
  const remove = useDeleteDebt();

  useEffect(() => {
    if (!open) return;
    setName(debt?.name ?? '');
    setType(debt?.type ?? 'credit_card');
    setCurrency(debt?.currency ?? 'VND');
    setBalance(debt ? minorToInput(debt.balanceMinor, debt.currency) : '');
    setRate(debt ? String(debt.monthlyFeeRateBp / 100) : '');
    setMinPay(debt ? minorToInput(debt.minPaymentMinor, debt.currency) : '');
    setStatementDay(debt?.statementDay ? String(debt.statementDay) : '');
    setDueDay(debt?.dueDay ? String(debt.dueDay) : '');
    setPinned(debt?.priorityOrder != null);
    setAliases(debt?.aliases.join(', ') ?? '');
    [create, patch, archive, remove].forEach((m) => m.reset());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debt]);

  const balanceMinor = balance.trim() === '' ? 0 : parseAmountInput(balance, currency);
  const minPayMinor = minPay.trim() === '' ? 0 : parseAmountInput(minPay, currency);
  const rateNum = rate.trim() === '' ? 0 : Number(rate.replace(',', '.'));
  const valid = name.trim() !== '' && balanceMinor !== null && minPayMinor !== null && Number.isFinite(rateNum) && rateNum >= 0 && rateNum <= 100;
  const busy = create.isPending || patch.isPending || archive.isPending || remove.isPending;
  const error = create.error ?? patch.error ?? archive.error ?? remove.error;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || balanceMinor === null || minPayMinor === null) return;
    const body = {
      name: name.trim(),
      balanceMinor,
      monthlyFeeRateBp: Math.round(rateNum * 100),
      minPaymentMinor: minPayMinor,
      statementDay: dayOrNull(statementDay),
      dueDay: dayOrNull(dueDay),
      priorityOrder: pinned ? 1 : null,
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
    };
    if (editing) {
      await patch.mutateAsync({ id: debt.id, ...body });
      toast.success(`Đã cập nhật ${body.name}`);
    } else {
      await create.mutateAsync([{ ...body, type, currency }]);
      toast.success(`Đã thêm ${body.name}`);
    }
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{editing ? `Sửa ${debt.name}` : 'Thêm khoản nợ'}</DrawerTitle>
          <DrawerDescription>
            {editing ? 'Sửa dư nợ ở đây là đối soát theo sao kê; trả nợ thì ghi giao dịch.' : 'Phí %/tháng quyết định thứ tự trả.'}
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={submit} className="space-y-4 overflow-y-auto px-5 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="d-name">Tên</Label>
            <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Vd: Thẻ Techcombank" />
          </div>

          {!editing && (
            <div className="grid grid-cols-[1fr_6.5rem] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="d-type">Loại</Label>
                <NativeSelect id="d-type" value={type} onChange={(e) => setType(e.target.value as DebtType)}>
                  <option value="credit_card">Thẻ tín dụng</option>
                  <option value="personal_loan">Khoản vay</option>
                  <option value="friend_debt">Nợ bạn bè</option>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-cur">Loại tiền</Label>
                <NativeSelect id="d-cur" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-bal">Dư nợ hiện tại</Label>
              <AmountInput id="d-bal" value={balance} onChange={setBalance} currency={currency} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-rate">Phí %/tháng</Label>
              <Input id="d-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Vd: 2 hoặc 1,8" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-st">Ngày sao kê</Label>
              <Input id="d-st" inputMode="numeric" value={statementDay} onChange={(e) => setStatementDay(e.target.value)} placeholder="1-31" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-due">Hạn trả</Label>
              <Input id="d-due" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="1-31" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-min">Trả tối thiểu</Label>
              <AmountInput id="d-min" value={minPay} onChange={setMinPay} currency={currency} placeholder="0" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="d-alias">Tên gọi khác (AI dùng để nhận ra)</Label>
            <Input id="d-alias" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Vd: tcb, thẻ tcb, Nam" />
          </div>

          <label className="flex items-center gap-3 rounded-2xl border bg-card p-4">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-5 accent-[var(--primary)]" />
            <span className="text-sm">
              <span className="font-semibold">Ưu tiên trả trước</span>
              <span className="block text-muted-foreground">Bỏ qua thứ tự theo phí, trả khoản này trước tiên.</span>
            </span>
          </label>

          {error && <p className="text-sm text-destructive">{error.message}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={!valid || busy}>
            {(create.isPending || patch.isPending) && <Loader2 className="animate-spin" />}
            {editing ? 'Lưu thay đổi' : 'Thêm khoản nợ'}
          </Button>

          {editing && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={debt.balanceMinor > 0 || busy}
                onClick={async () => {
                  await archive.mutateAsync(debt.id);
                  toast.success(`Đã đóng ${debt.name}`);
                  onOpenChange(false);
                }}
              >
                <Archive /> Đóng khoản nợ
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(`Xoá hẳn "${debt.name}"? Chỉ xoá được khi chưa có giao dịch.`)) return;
                  await remove.mutateAsync(debt.id);
                  toast.success(`Đã xoá ${debt.name}`);
                  onOpenChange(false);
                }}
              >
                <Trash2 /> Xoá
              </Button>
            </div>
          )}
        </form>
      </DrawerContent>
    </Drawer>
  );
}
