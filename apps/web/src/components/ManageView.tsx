import { formatMinor, formatVnd, type Debt } from '@bank/core';
import { ChevronRight, CreditCard, Loader2, Plus, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard, useDebts, usePatchBudget, useSaveSettings, useSetFx, useSettings } from '@/lib/api';
import { parseAmountInput } from '@/lib/amount';
import { AmountInput } from './AmountInput';
import { DebtFormDrawer } from './DebtFormDrawer';
import { AdminUsersCard, GroupCard, ProfileCard } from './TeamCards';

function DebtsCard() {
  const { data: debts, isLoading } = useDebts();
  const [editing, setEditing] = useState<Debt | undefined>();
  const [open, setOpen] = useState(false);

  const openForm = (d?: Debt) => {
    setEditing(d);
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Khoản nợ</CardTitle>
        <CardDescription>Chạm để sửa phí, ngày sao kê, ưu tiên.</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => openForm()}>
            <Plus /> Thêm
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <ul className="divide-y">
            {debts?.map((d, i) => {
              const Icon = d.type === 'friend_debt' ? Users : CreditCard;
              return (
                <motion.li key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <button onClick={() => openForm(d)} className="flex w-full items-center gap-3 py-3 text-left">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{d.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.monthlyFeeRateBp ? `${(d.monthlyFeeRateBp / 100).toLocaleString('vi-VN')}%/tháng` : 'Không phí'}
                        {d.dueDay ? `, hạn ngày ${d.dueDay}` : ''}
                        {d.priorityOrder !== null ? ', ưu tiên' : ''}
                      </span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {d.balanceMinor === 0 ? 'Đã trả hết' : formatMinor(d.balanceMinor, d.currency)}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <DebtFormDrawer open={open} onOpenChange={setOpen} debt={editing} />
    </Card>
  );
}

function BudgetRow({ id, name, limit, spent }: { id: string; name: string; limit: number | null; spent: number }) {
  const [value, setValue] = useState(limit ? String(limit) : '');
  const save = usePatchBudget();
  useEffect(() => setValue(limit ? String(limit) : ''), [limit]);

  async function commit() {
    const next = value.trim() === '' ? null : parseAmountInput(value, 'VND');
    if (next === undefined || (value.trim() !== '' && next === null)) return toast.error(`Hạn mức "${value}" không hợp lệ`);
    if (next === limit) return;
    await save.mutateAsync({ id, monthlyLimitVnd: next });
    toast.success(`Đã đặt hạn mức ${name}`);
  }

  const pct = limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">
            Tháng này {formatVnd(spent)}
            {limit ? ` / ${formatVnd(limit)}` : ''}
          </span>
        </span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          inputMode="decimal"
          placeholder="Hạn mức"
          className="h-10 w-28 text-right text-sm"
          aria-label={`Hạn mức ${name}`}
        />
      </div>
      {limit ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            className={pct >= 100 ? 'h-full bg-destructive' : 'h-full bg-primary'}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </li>
  );
}

function BudgetsCard() {
  const { data } = useDashboard();
  const budgets = data?.budgets.filter((b) => b.kind !== 'debt' && b.kind !== 'savings') ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hạn mức chi tiêu</CardTitle>
        <CardDescription>Gõ 8tr, 500k… rồi bấm ra ngoài để lưu. Để trống là không giới hạn.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {budgets.map((b) => (
            <BudgetRow key={b.id} id={b.id} name={b.name} limit={b.monthlyLimitVnd} spent={b.spentThisMonthVnd} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SettingsCard() {
  const { data } = useSettings();
  const saveSettings = useSaveSettings();
  const setFx = useSetFx();
  const [budget, setBudget] = useState('');
  const [usd, setUsd] = useState('');
  const [usdt, setUsdt] = useState('');
  const [efTarget, setEfTarget] = useState('');
  const [efMonthly, setEfMonthly] = useState('');

  useEffect(() => {
    if (!data) return;
    setBudget(String(data.monthlyDebtBudgetVnd));
    setUsd(data.rates.USD ? String(data.rates.USD) : '');
    setUsdt(data.rates.USDT ? String(data.rates.USDT) : '');
    setEfTarget(data.emergencyFundTargetVnd ? String(data.emergencyFundTargetVnd) : '');
    setEfMonthly(data.emergencyFundMonthlyVnd ? String(data.emergencyFundMonthlyVnd) : '');
  }, [data]);

  const budgetVnd = parseAmountInput(budget, 'VND');
  const usdRate = Number(usd.replace(/\D/g, ''));
  const usdtRate = Number(usdt.replace(/\D/g, ''));
  const efTargetVnd = efTarget.trim() === '' ? 0 : parseAmountInput(efTarget, 'VND');
  const efMonthlyVnd = efMonthly.trim() === '' ? null : parseAmountInput(efMonthly, 'VND');
  const busy = saveSettings.isPending || setFx.isPending;

  async function save() {
    if (!data || budgetVnd === null) return;
    if (efTargetVnd === null || (efMonthly.trim() !== '' && efMonthlyVnd === null)) {
      toast.error('Số tiền quỹ khẩn cấp không hợp lệ');
      return;
    }
    const changes: Parameters<typeof saveSettings.mutateAsync>[0] = {};
    if (budgetVnd !== data.monthlyDebtBudgetVnd) changes.monthlyDebtBudgetVnd = budgetVnd;
    if (efTargetVnd !== data.emergencyFundTargetVnd) changes.emergencyFundTargetVnd = efTargetVnd;
    if (efMonthlyVnd !== data.emergencyFundMonthlyVnd) changes.emergencyFundMonthlyVnd = efMonthlyVnd;
    if (Object.keys(changes).length) await saveSettings.mutateAsync(changes);
    if (usdRate > 0 && usdRate !== data.rates.USD) await setFx.mutateAsync({ currency: 'USD', rateVnd: usdRate });
    if (usdtRate > 0 && usdtRate !== data.rates.USDT) await setFx.mutateAsync({ currency: 'USDT', rateVnd: usdtRate });
    toast.success('Đã lưu cài đặt, lộ trình đã tính lại');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kế hoạch & tỷ giá</CardTitle>
        <CardDescription>Áp dụng cho không gian đang chọn. Tỷ giá dùng chung mọi không gian.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="s-budget">Ngân sách trả nợ mỗi tháng</Label>
              <AmountInput id="s-budget" value={budget} onChange={setBudget} currency="VND" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-ef">Mục tiêu quỹ khẩn cấp</Label>
                <AmountInput id="s-ef" value={efTarget} onChange={setEfTarget} currency="VND" placeholder="Vd: 250tr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-efm">Góp mỗi tháng</Label>
                <AmountInput id="s-efm" value={efMonthly} onChange={setEfMonthly} currency="VND" placeholder="Vd: 38,3tr" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-usd">1 USD = ? VND</Label>
                <Input id="s-usd" inputMode="numeric" value={usd} onChange={(e) => setUsd(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-usdt">1 USDT = ? VND</Label>
                <Input id="s-usdt" inputMode="numeric" value={usdt} onChange={(e) => setUsdt(e.target.value)} />
              </div>
            </div>
            <Button className="w-full" size="lg" onClick={save} disabled={busy || budgetVnd === null}>
              {busy && <Loader2 className="animate-spin" />} Lưu cài đặt
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ManageView() {
  return (
    <div className="space-y-4">
      <GroupCard />
      <DebtsCard />
      <SettingsCard />
      <BudgetsCard />
      <ProfileCard />
      <AdminUsersCard />
    </div>
  );
}
