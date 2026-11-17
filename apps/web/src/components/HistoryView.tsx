import { formatMinor, formatVnd, type DashboardResponse, type TransactionView } from '@bank/core';
import { ArrowDownLeft, ArrowUpRight, Check, PiggyBank, Receipt, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeleteTransaction, useTransactions } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

export const TX_META: Record<TransactionView['type'], { label: string; icon: typeof Receipt; tone: string }> = {
  income: { label: 'Thu nhập', icon: ArrowDownLeft, tone: 'bg-accent/40 text-primary' },
  expense: { label: 'Chi tiêu', icon: ArrowUpRight, tone: 'bg-muted text-foreground' },
  debt_payment: { label: 'Trả nợ', icon: Check, tone: 'bg-secondary text-primary' },
  debt_fee: { label: 'Phí nợ', icon: Receipt, tone: 'bg-warning/15 text-warning' },
  savings_contribution: { label: 'Góp quỹ', icon: PiggyBank, tone: 'bg-secondary text-primary' },
};

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}/${y}`;
};

export function HistoryView({ dashboard }: { dashboard: DashboardResponse }) {
  const { data, isLoading } = useTransactions();
  const del = useDeleteTransaction();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { isShared } = useWorkspace();

  if (isLoading) return <Skeleton className="h-80 rounded-[28px]" />;

  const groups = new Map<string, TransactionView[]>();
  for (const t of data ?? []) groups.set(t.occurredOn, [...(groups.get(t.occurredOn) ?? []), t]);

  const targetName = (t: TransactionView) =>
    (t.debtId && dashboard.debts.find((d) => d.id === t.debtId)?.name) ||
    (t.goalId && dashboard.goals.find((g) => g.id === t.goalId)?.name) ||
    (t.budgetId && dashboard.budgets.find((b) => b.id === t.budgetId)?.name) ||
    null;

  async function remove(id: string) {
    await del.mutateAsync(id);
    setConfirmId(null);
    toast('Đã xoá giao dịch', { description: 'Số dư đã được tính lại.' });
  }

  if (!groups.size) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Chưa có giao dịch nào. Bấm nút ✦ ở thanh dưới để ghi giao dịch đầu tiên.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([day, items]) => (
        <Card key={day} className="gap-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{dayLabel(day)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              <AnimatePresence initial={false}>
                {items.map((t) => {
                  const meta = TX_META[t.type];
                  const Icon = meta.icon;
                  const target = targetName(t);
                  const sign = t.type === 'income' ? '+' : t.type === 'savings_contribution' ? '' : '−';
                  return (
                    <motion.li
                      key={t.id}
                      layout
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-3 overflow-hidden py-3"
                    >
                      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${meta.tone}`}>
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {meta.label}
                          {target && <span className="font-normal text-muted-foreground"> · {target}</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {isShared && t.createdByName && <span className="font-medium text-foreground">{t.createdByName} · </span>}
                          {t.note || (t.source === 'ai' ? 'Ghi bằng AI' : 'Ghi tay')}
                        </p>
                      </div>
                      {confirmId === t.id ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                            Giữ
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => remove(t.id)} disabled={del.isPending}>
                            Xoá
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="text-right tabular-nums">
                            <p className={`text-sm font-semibold ${t.type === 'income' ? 'text-primary' : ''}`}>
                              {sign}
                              {formatMinor(t.amountMinor, t.currency)}
                            </p>
                            {t.currency !== 'VND' && <p className="text-[11px] text-muted-foreground">≈ {formatVnd(t.amountVnd)}</p>}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-muted-foreground"
                            onClick={() => setConfirmId(t.id)}
                            aria-label="Xoá giao dịch"
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
