import { formatMinor, formatVnd, formatVndShort, type DebtView } from '@bank/core';
import { CheckCircle2, CreditCard, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ddmm, debtColor, monthShort } from '@/lib/format';

const TYPE_LABEL: Record<DebtView['type'], string> = {
  credit_card: 'Thẻ tín dụng',
  personal_loan: 'Khoản vay',
  friend_debt: 'Nợ bạn bè',
};

export function DebtCard({ debt, index }: { debt: DebtView; index: number }) {
  const paidOff = debt.balanceMinor === 0;
  const original = debt.paidTotalVnd + debt.balanceVnd;
  const progress = original > 0 ? debt.paidTotalVnd / original : 1;
  const segments = 3;
  const rate = (debt.monthlyFeeRateBp / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  const Icon = debt.type === 'friend_debt' ? Users : CreditCard;
  const due = debt.nextDue;
  const urgent = !paidOff && due && due.daysUntil <= 7;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className={paidOff ? 'opacity-60' : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {debt.name}
            {debt.payoffRank === 1 && <Badge variant="accent">Đang ưu tiên</Badge>}
          </CardTitle>
          <CardDescription>
            {TYPE_LABEL[debt.type]} · {debt.monthlyFeeRateBp > 0 ? `phí ${rate}%/tháng` : 'không phí'}
          </CardDescription>
          <CardAction>
            <span
              className="grid size-11 place-items-center rounded-full border"
              style={{ color: paidOff ? 'var(--primary)' : 'var(--foreground)' }}
            >
              {paidOff ? <CheckCircle2 className="size-5" /> : <Icon className="size-5" strokeWidth={1.8} />}
            </span>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Dư nợ" value={paidOff ? 'Đã hết' : formatVndShort(debt.balanceVnd)} sub={debt.currency !== 'VND' && !paidOff ? formatMinor(debt.balanceMinor, debt.currency) : undefined} />
            <Field label="Trả tháng này" value={formatVndShort(debt.paidThisMonthVnd)} />
            <Field label="Dự kiến xong" value={paidOff ? '✓' : monthShort(debt.projectedPayoffMonth)} />
          </div>

          <div className="flex gap-1.5" role="progressbar" aria-label={`Đã trả ${Math.round(progress * 100)}%`}>
            {Array.from({ length: segments }, (_, i) => {
              const fill = Math.min(1, Math.max(0, progress * segments - i));
              return (
                <span key={i} className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <motion.span
                    className="block h-full rounded-full"
                    style={{ background: paidOff ? 'var(--primary)' : debtColor(debt) }}
                    initial={{ width: 0 }}
                    animate={{ width: `${fill * 100}%` }}
                    transition={{ delay: 0.35 + index * 0.06 + i * 0.12, duration: 0.5, ease: 'easeOut' }}
                  />
                </span>
              );
            })}
          </div>
        </CardContent>

        {!paidOff && (
          <CardFooter className="justify-between gap-2 text-sm text-muted-foreground">
            <span>{debt.nextStatement ? `Sao kê ${ddmm(debt.nextStatement.date)}` : formatVnd(debt.balanceVnd)}</span>
            {debt.feeSavedVnd > 0 ? (
              <span className="flex items-center gap-1.5">
                Phí tránh <Badge variant="dark">{formatVndShort(debt.feeSavedVnd)}</Badge>
              </span>
            ) : debt.estimatedFeeVnd > 0 ? (
              <span className="flex items-center gap-1.5">
                Phí <Badge variant="secondary">{formatVndShort(debt.estimatedFeeVnd)}</Badge>
              </span>
            ) : null}
            {due &&
              (urgent ? (
                <Badge variant={due.daysUntil <= 3 ? 'destructive' : 'warning'}>
                  {due.daysUntil === 0 ? 'Hạn hôm nay' : `Hạn ${ddmm(due.date)} · ${due.daysUntil}d`}
                </Badge>
              ) : (
                <span>Hạn {ddmm(due.date)}</span>
              ))}
          </CardFooter>
        )}
      </Card>
    </motion.div>
  );
}

function Field({ label, value, sub }: { label: string; value: string; sub?: string | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground tabular-nums">{sub}</p>}
    </div>
  );
}
