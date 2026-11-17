import { formatVndShort, type DashboardResponse } from '@bank/core';
import { Baby, Car, CreditCard, HeartPulse, House, PiggyBank, ShoppingBasket, Sparkles, Wallet, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ICONS: Record<string, LucideIcon> = {
  rent: House,
  car: Car,
  childcare: Baby,
  parents: HeartPulse,
  living: ShoppingBasket,
  growth: Sparkles,
  'debt-payoff': CreditCard,
  'ef-saving': PiggyBank,
};

/** Short labels for the 4-column grid; full name stays in aria-label. */
const SHORT: Record<string, string> = {
  rent: 'Tiền nhà',
  car: 'Trả góp xe',
  childcare: 'Con nhỏ',
  parents: 'Bố mẹ',
  living: 'Sinh hoạt',
  growth: 'AI tools',
  'debt-payoff': 'Trả nợ',
  'ef-saving': 'Quỹ',
};

export function BudgetGrid({ budgets, onPick }: { budgets: DashboardResponse['budgets']; onPick: (name: string) => void }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Ngân sách tháng này</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-4 gap-x-2 gap-y-4">
        {budgets.map((b, i) => {
          const Icon = (b.slug && ICONS[b.slug]) || Wallet;
          return (
            <motion.button
              key={b.id}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25 + i * 0.04, type: 'spring', stiffness: 380, damping: 26 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => onPick(b.name)}
              className="flex flex-col items-center gap-1.5 rounded-2xl py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label={`Ghi chi tiêu: ${b.name}`}
            >
              <span className="grid size-14 place-items-center rounded-full bg-secondary text-primary">
                <Icon className="size-[22px]" strokeWidth={1.8} />
              </span>
              <span className="text-xs font-medium text-foreground">{(b.slug && SHORT[b.slug]) || b.name}</span>
              <span className="-mt-1 text-[11px] text-muted-foreground tabular-nums">
                {b.spentThisMonthVnd > 0 ? formatVndShort(b.spentThisMonthVnd) : '\u00a0'}
              </span>
            </motion.button>
          );
        })}
      </CardContent>
    </Card>
  );
}
