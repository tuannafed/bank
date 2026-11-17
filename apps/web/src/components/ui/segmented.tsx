import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}

/** Segmented control with a sliding thumb. */
export function Segmented<T extends string>({ value, onChange, options, className }: Props<T>) {
  const id = useId();
  return (
    <div role="radiogroup" className={cn('flex rounded-full bg-muted p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              active ? 'text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
