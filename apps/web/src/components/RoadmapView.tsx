import { formatVndShort, type DashboardResponse } from '@bank/core';
import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSchedule } from '@/lib/api';
import { debtColor, monthLabel, monthShort } from '@/lib/format';

type CellState = 'paying' | 'waiting' | 'done';

function Timeline({ data }: { data: DashboardResponse }) {
  const months = data.timeline;
  const debts = data.debts.filter((d) => d.balanceVnd > 0);
  if (!months.length || !debts.length) return null;

  const state = (id: string, i: number): CellState => {
    if ((months[i]!.paidByDebt[id] ?? 0) > 0) return 'paying';
    return months.slice(i + 1).some((m) => (m.paidByDebt[id] ?? 0) > 0) ? 'waiting' : 'done';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thứ tự trả nợ</CardTitle>
        <CardDescription>Khoản phí cao được dồn tiền trước, các khoản khác chờ đến lượt.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div
            className="grid gap-x-1 gap-y-2"
            style={{ gridTemplateColumns: `6.75rem repeat(${months.length}, minmax(1.5rem, 1fr))` }}
          >
            <span />
            {months.map((m, i) => (
              <span key={m.month} className={`text-center text-xs ${i === 0 ? 'font-semibold' : 'text-muted-foreground'}`}>
                {monthLabel(m.month)}
              </span>
            ))}
            {debts.map((d, row) => (
              <div key={d.id} className="contents">
                <span className="truncate pr-2 text-sm" title={d.name}>
                  {d.name}
                </span>
                {months.map((m, i) => {
                  const s = state(d.id, i);
                  return (
                    <motion.span
                      key={m.month}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.05 * (row + i), type: 'spring', stiffness: 420, damping: 28 }}
                      className="h-8 rounded-lg"
                      style={{ color: debtColor(d) }}
                      title={`${d.name} ${monthLabel(m.month)}: ${s === 'paying' ? 'đang trả' : s === 'waiting' ? 'chờ đến lượt' : 'đã xong'}`}
                    >
                      {s === 'paying' && <span className="block size-full rounded-lg bg-current" />}
                      {s === 'waiting' && <span className="hatch block size-full rounded-lg" />}
                    </motion.span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-primary" /> Đang trả
          </span>
          <span className="flex items-center gap-1.5">
            <span className="hatch size-3 rounded text-primary" /> Chờ đến lượt
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthTable() {
  const { data, isLoading } = useSchedule();
  if (isLoading) return <Skeleton className="h-64 rounded-[28px]" />;
  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Từng tháng</CardTitle>
        <CardDescription>
          {data.feasible
            ? `Hết nợ ${monthShort(data.debtFreeMonth)}, tổng phí ${formatVndShort(data.totalFeesVnd)}`
            : (data.reason ?? 'Không trả hết được với ngân sách hiện tại')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {data.months.map((m, i) => (
            <motion.li
              key={m.month}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.04 * i }}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="w-14 font-semibold">{monthLabel(m.month)}</span>
              <span className="flex-1 text-sm text-muted-foreground">
                {i === 0 && m.paidVnd === 0
                  ? 'Đã trả đủ ngân sách'
                  : `${i === 0 ? 'Còn trả' : 'Trả'} ${formatVndShort(m.paidVnd)}`}
                {m.feeVnd > 0 && `, phí ${formatVndShort(m.feeVnd)}`}
              </span>
              {m.totalEndVnd === 0 ? (
                <Badge variant="accent">Hết nợ</Badge>
              ) : (
                <span className="text-sm font-semibold tabular-nums">{formatVndShort(m.totalEndVnd)}</span>
              )}
            </motion.li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function RoadmapView({ data }: { data: DashboardResponse }) {
  return (
    <div className="space-y-4">
      <Timeline data={data} />
      <MonthTable />
    </div>
  );
}
