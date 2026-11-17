import { formatVnd, formatVndShort, type DashboardResponse } from '@bank/core';
import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function MonthCard({ data }: { data: DashboardResponse }) {
  const month = Number(data.today.slice(5, 7));
  const pct = Math.min(100, Math.round((data.paidThisMonthVnd / data.monthlyDebtBudgetVnd) * 100));
  const segments = 10;
  const filled = Math.round((pct / 100) * segments);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trả nợ tháng {month}</CardTitle>
        <CardDescription>Ngân sách {formatVnd(data.monthlyDebtBudgetVnd)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Đã trả" value={formatVndShort(data.paidThisMonthVnd)} />
          <Stat label="Phí tránh được" value={formatVndShort(data.feeSavedThisMonthVnd)} tone="text-primary" />
          <Stat label="Phí dự kiến" value={formatVndShort(data.estimatedFeeThisMonthVnd)} />
        </div>
        <div className="flex gap-1.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          {Array.from({ length: segments }, (_, i) => (
            <motion.span
              key={i}
              className="h-2.5 flex-1 origin-left rounded-full"
              style={{ background: i < filled ? 'var(--accent)' : 'var(--muted)' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.3 + i * 0.04, duration: 0.35 }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Đã dùng {pct}% ngân sách</span>
          <Badge variant="dark">{formatVndShort(Math.max(0, data.monthlyDebtBudgetVnd - data.paidThisMonthVnd))} còn lại</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone = 'text-foreground' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
