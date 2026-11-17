import { formatMinor, type Currency } from '@bank/core';
import { Input } from '@/components/ui/input';
import { parseAmountInput } from '@/lib/amount';

interface Props {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  currency: Currency;
  placeholder?: string;
}

/** Free-text amount ("28tr", "500k", "1150.5") with a live read-back of what will be saved. */
export function AmountInput({ id, value, onChange, currency, placeholder }: Props) {
  const minor = parseAmountInput(value, currency);
  return (
    <div>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder ?? (currency === 'VND' ? 'Vd: 28tr, 500k' : 'Vd: 1150')}
        aria-invalid={value !== '' && minor === null}
        className="aria-[invalid=true]:border-destructive"
      />
      <p className="mt-1 h-4 px-1 text-xs text-muted-foreground tabular-nums">
        {value === '' ? '' : minor === null ? 'Không đọc được số tiền' : `= ${formatMinor(minor, currency)}`}
      </p>
    </div>
  );
}
