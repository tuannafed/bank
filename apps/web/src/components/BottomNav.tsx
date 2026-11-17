import { CalendarRange, History, House, SlidersHorizontal, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export type Tab = 'home' | 'roadmap' | 'history' | 'manage';

const TABS: { id: Tab; label: string; icon: typeof House }[] = [
  { id: 'home', label: 'Tổng quan', icon: House },
  { id: 'roadmap', label: 'Lộ trình', icon: CalendarRange },
  { id: 'history', label: 'Lịch sử', icon: History },
  { id: 'manage', label: 'Quản lý', icon: SlidersHorizontal },
];

export function BottomNav({ tab, onTab, onQuickLog }: { tab: Tab; onTab: (t: Tab) => void; onQuickLog: () => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="hero-bg mx-auto flex max-w-md items-center justify-between rounded-full p-2 shadow-[0_12px_32px_-12px_rgba(14,42,31,0.6)]">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => onTab(id)}
              className={cn(
                'relative flex h-12 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent',
                active ? 'flex-[1.6] text-white' : 'flex-1 text-white/60',
              )}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-white/12"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <Icon className="relative size-5" />
              {active && (
                <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} className="relative overflow-hidden whitespace-nowrap">
                  {label}
                </motion.span>
              )}
            </button>
          );
        })}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onQuickLog}
          className="ml-1 grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Ghi nhanh bằng AI"
        >
          <Sparkles className="size-5" />
        </motion.button>
      </div>
    </nav>
  );
}
