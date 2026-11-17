import type { DashboardResponse } from '@bank/core';
import { Bell, ChevronDown, Hexagon, RefreshCw, ScanLine, Sparkles, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { greeting } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from './AnimatedNumber';

interface Props {
  data: DashboardResponse;
  refreshing: boolean;
  onRefresh: () => void;
  onQuickLog: () => void;
  onOpenRoadmap: () => void;
  onScan: () => void;
  onOpenWorkspaces: () => void;
}

const usdFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const vndFmt = new Intl.NumberFormat('vi-VN');

export function Hero({ data, refreshing, onRefresh, onQuickLog, onScan, onOpenWorkspaces }: Props) {
  const { me, current } = useWorkspace();
  const firstName = me.data?.user.name.split(' ').pop();
  const [unit, setUnit] = useState<'VND' | 'USD'>('VND');
  const { roadmap } = data;
  const isDebt = roadmap.phase === 'debt_freedom';
  const pct = Math.round(roadmap.progress * 100);
  const usdRate = data.rates.USD ?? data.rates.USDT ?? null;
  const dueSoon = data.debts.filter((d) => d.balanceMinor > 0 && d.nextDue && d.nextDue.daysUntil <= 7).length;

  const amount = isDebt ? roadmap.remainingVnd : roadmap.currentVnd;
  const shown = unit === 'USD' && usdRate ? amount / usdRate : amount;
  const fmt = (n: number) => (unit === 'USD' ? usdFmt.format(n) : vndFmt.format(n));

  return (
    <header className="hero-bg relative px-5 pb-20 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-white">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-full bg-white/10 text-accent ring-1 ring-white/15">
          {current?.kind === 'shared' ? <Users className="size-5" /> : <Hexagon className="size-5" strokeWidth={2.5} />}
        </div>
        <button onClick={onOpenWorkspaces} className="min-w-0 flex-1 text-left" aria-label="Đổi không gian">
          <p className="text-xs text-white/60">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}!
          </p>
          <p className="flex items-center gap-1 font-semibold">
            <span className="truncate">{current?.name ?? 'Kế hoạch tài chính'}</span>
            <ChevronDown className="size-4 shrink-0 text-white/70" />
          </p>
        </button>
        <Button variant="glass" size="icon" className="rounded-full" onClick={onRefresh} aria-label="Tải lại">
          <RefreshCw className={cn(refreshing && 'animate-spin')} />
        </Button>
        <Button variant="glass" size="icon" className="relative rounded-full" aria-label={`${dueSoon} khoản sắp đến hạn`}>
          <Bell />
          {dueSoon > 0 && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-accent ring-2 ring-[var(--hero-from)]" />}
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8"
      >
        <p className="text-sm text-white/70">
          {isDebt ? 'Tổng dư nợ' : roadmap.targetVnd === 0 ? 'Chưa có khoản nợ nào' : 'Quỹ khẩn cấp'}
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-baseline gap-1.5">
            {unit === 'USD' && <span className="text-2xl font-semibold text-white/70">$</span>}
            <AnimatedNumber value={shown} format={fmt} className="text-[2.4rem] leading-none font-bold tracking-tight tabular-nums" />
            {unit === 'VND' && <span className="text-xl font-semibold text-white/70">₫</span>}
          </p>
          {usdRate && (
            <button
              onClick={() => setUnit((u) => (u === 'VND' ? 'USD' : 'VND'))}
              className="shrink-0 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10"
              aria-label="Đổi đơn vị hiển thị"
            >
              {unit} ⇄
            </button>
          )}
        </div>

        <div className="mt-5">
          <div className="flex justify-between text-xs text-white/70">
            <span>Giai đoạn {isDebt ? 1 : 2}/2 · {isDebt ? 'Trả hết nợ' : 'Quỹ khẩn cấp'}</span>
            <span className="font-semibold text-accent">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(pct, 2)}%` }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="accent" size="lg" onClick={onQuickLog}>
            <Sparkles /> Ghi nhanh
          </Button>
          <Button variant="glass" size="lg" onClick={onScan}>
            <ScanLine /> Quét bill
          </Button>
        </div>
      </motion.div>
    </header>
  );
}
