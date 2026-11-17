import { formatMinor, formatVnd, type DashboardResponse, type NewDebtDraft, type TransactionDraft } from '@bank/core';
import { AlertTriangle, ArrowUp, Camera, ImagePlus, Loader2, PlusCircle, ScanLine, Sparkles, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { useCreateDebts, useCreateTransactions, useParse } from '@/lib/api';
import { fileToDataUrl } from '@/lib/image';
import { TX_META } from './HistoryView';
import { ManualTxForm } from './ManualTxForm';

const EXAMPLES = ['Nhận lương 35tr', 'Trả thẻ VPBank 28tr', 'Ăn trưa 85k', 'Thêm nợ thẻ TCB 20tr phí 1,9%'];
const DEBT_TYPE: Record<NewDebtDraft['type'], string> = {
  credit_card: 'Thẻ tín dụng',
  personal_loan: 'Khoản vay',
  friend_debt: 'Nợ bạn bè',
};

type Mode = 'ai' | 'manual';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: string;
  /** Photo already taken via the "Quét bill" button (data URL). */
  prefillImage?: string | null;
  dashboard: DashboardResponse | undefined;
}

export function QuickLogDrawer({ open, onOpenChange, prefill, prefillImage = null, dashboard }: Props) {
  const [mode, setMode] = useState<Mode>('ai');
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [drafts, setDrafts] = useState<TransactionDraft[] | null>(null);
  const [newDebts, setNewDebts] = useState<NewDebtDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const parse = useParse();
  const createTx = useCreateTransactions();
  const createDebts = useCreateDebts();

  useEffect(() => {
    if (!open) return;
    setMode('ai');
    setText(prefill);
    setImage(prefillImage);
    setDrafts(null);
    setNewDebts([]);
    setWarnings([]);
    setQuestion(null);
    parse.reset();
    createTx.reset();
    createDebts.reset();
    if (prefillImage) return; // keep the keyboard down so the photo stays visible
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, prefillImage]);

  // ⌘V / Ctrl+V a screenshot of a bill while the drawer is open (AI mode).
  useEffect(() => {
    if (!open || mode !== 'ai' || drafts !== null) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      void onPickImage(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, drafts]);

  const targetName = (d: TransactionDraft) =>
    (d.debtId && dashboard?.debts.find((x) => x.id === d.debtId)?.name) ||
    (d.goalId && dashboard?.goals.find((x) => x.id === d.goalId)?.name) ||
    (d.budgetId && dashboard?.budgets.find((x) => x.id === d.budgetId)?.name) ||
    null;

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    setImageBusy(true);
    try {
      setImage(await fileToDataUrl(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không đọc được ảnh');
    } finally {
      setImageBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const input = text.trim();
    if ((!input && !image) || parse.isPending) return;
    const res = await parse.mutateAsync({ text: input, ...(image ? { imageDataUrl: image } : {}) }).catch(() => null);
    if (!res) return;
    setDrafts(res.drafts);
    setNewDebts(res.newDebts);
    setWarnings(res.warnings);
    setQuestion(res.needsClarification);
  }

  async function save() {
    if (newDebts.length) await createDebts.mutateAsync(newDebts);
    if (drafts?.length) await createTx.mutateAsync(drafts);
    const parts = [newDebts.length && `${newDebts.length} khoản nợ mới`, drafts?.length && `${drafts.length} giao dịch`].filter(Boolean);
    toast.success(`Đã lưu ${parts.join(' và ')}`);
    onOpenChange(false);
  }

  const reviewing = drafts !== null;
  const total = (drafts?.length ?? 0) + newDebts.length;
  const saving = createTx.isPending || createDebts.isPending;
  const saveError = createTx.error ?? createDebts.error;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> {reviewing ? 'Kiểm tra trước khi lưu' : 'Ghi giao dịch'}
          </DrawerTitle>
          <DrawerDescription>
            {reviewing
              ? 'Bỏ dòng sai bằng nút ✕, rồi bấm lưu.'
              : mode === 'ai'
                ? 'Gõ như nhắn tin, hoặc chụp bill chuyển khoản.'
                : 'Điền từng trường, lưu ngay không qua AI.'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto px-5">
          {!reviewing && (
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'ai', label: 'AI' },
                { value: 'manual', label: 'Nhập tay' },
              ]}
              className="mb-4"
            />
          )}

          <AnimatePresence mode="wait" initial={false}>
            {reviewing ? (
              <motion.div key="review" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} className="space-y-2">
                {question && <p className="rounded-2xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">{question}</p>}
                {warnings.map((w) => (
                  <p key={w} className="flex gap-2 rounded-2xl bg-warning/10 px-4 py-3 text-sm text-warning">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}
                  </p>
                ))}

                {newDebts.length > 0 && (
                  <ul className="divide-y rounded-3xl border border-dashed border-primary/40 bg-secondary/40 px-4">
                    {newDebts.map((d, i) => (
                      <motion.li key={`debt-${i}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 py-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                          <PlusCircle className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">Nợ mới · {d.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {DEBT_TYPE[d.type]}, phí {(d.monthlyFeeRateBp / 100).toLocaleString('vi-VN')}%/tháng
                            {d.statementDay ? `, sao kê ngày ${d.statementDay}` : ''}
                          </p>
                        </div>
                        <p className="text-sm font-semibold tabular-nums">{formatMinor(d.balanceMinor, d.currency)}</p>
                        <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => setNewDebts(newDebts.filter((_, j) => j !== i))} aria-label="Bỏ khoản nợ này">
                          <X />
                        </Button>
                      </motion.li>
                    ))}
                  </ul>
                )}

                {drafts.length > 0 && (
                  <ul className="divide-y rounded-3xl border bg-card px-4">
                    <AnimatePresence initial>
                      {drafts.map((d, i) => {
                        const meta = TX_META[d.type];
                        const Icon = meta.icon;
                        const target = targetName(d);
                        return (
                          <motion.li
                            key={`${i}-${d.note}`}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.06 } }}
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
                                {d.occurredOn !== dashboard?.today && `${d.occurredOn.split('-').reverse().join('/')} · `}
                                {d.note}
                              </p>
                            </div>
                            <div className="text-right tabular-nums">
                              <p className="text-sm font-semibold">{formatMinor(d.amountMinor, d.currency)}</p>
                              {d.currency !== 'VND' && (
                                <p className="text-[11px] text-muted-foreground">
                                  ≈ {formatVnd(d.amountVnd)} @ {d.fxRateVnd.toLocaleString('vi-VN')}
                                </p>
                              )}
                            </div>
                            <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} aria-label="Bỏ giao dịch này">
                              <X />
                            </Button>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                )}

                {total === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Không có gì để lưu.</p>}
                {saveError && <p className="text-sm text-destructive">{saveError.message}</p>}
              </motion.div>
            ) : mode === 'ai' ? (
              <motion.form
                key="ai"
                onSubmit={onSubmit}
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                className="relative space-y-3 pb-4"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
                  if (file) void onPickImage(file);
                  else toast.error('Chỉ nhận file ảnh');
                }}
              >
                {dragging && (
                  <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-3xl border-2 border-dashed border-primary bg-secondary/90 text-sm font-semibold text-primary">
                    <span className="flex items-center gap-2">
                      <Upload className="size-5" /> Thả ảnh bill vào đây
                    </span>
                  </div>
                )}
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void onPickImage(e.target.files?.[0]); e.target.value = ""; }} />
                <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => { void onPickImage(e.target.files?.[0]); e.target.value = ""; }} />

                <AnimatePresence>
                  {(image || imageBusy) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="relative overflow-hidden rounded-3xl border bg-muted"
                    >
                      {image ? (
                        <>
                          <img src={image} alt="Bill đã chọn" className="max-h-56 w-full object-contain" />
                          {parse.isPending && (
                            <motion.div
                              className="absolute inset-x-0 h-1 bg-accent shadow-[0_0_24px_6px_rgba(184,240,106,0.7)]"
                              initial={{ top: '0%' }}
                              animate={{ top: ['0%', '100%', '0%'] }}
                              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                            />
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="absolute right-2 top-2 size-8 rounded-full"
                            onClick={() => setImage(null)}
                            aria-label="Bỏ ảnh"
                          >
                            <X />
                          </Button>
                        </>
                      ) : (
                        <div className="grid h-32 place-items-center text-muted-foreground">
                          <Loader2 className="animate-spin" />
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative">
                  <Input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={image ? 'Thêm ghi chú cho bill (không bắt buộc)' : 'Vd: nhận 1150 USDT, trả VPBank 28tr'}
                    maxLength={500}
                    enterKeyHint="send"
                    className="pr-14"
                    aria-label="Nội dung giao dịch"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="absolute right-1.5 top-1.5 size-9"
                    disabled={(!text.trim() && !image) || parse.isPending || imageBusy}
                    aria-label="Phân tích"
                  >
                    {parse.isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
                  </Button>
                </div>

                {!image && !imageBusy && (
                  <button
                    type="button"
                    onClick={() => galleryRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1 rounded-3xl border-2 border-dashed border-border bg-card px-4 py-5 text-center transition-colors hover:border-primary/50"
                  >
                    <Upload className="size-5 text-primary" />
                    <span className="text-sm font-semibold">Tải ảnh bill lên</span>
                    <span className="text-xs text-muted-foreground">Chạm để chọn ảnh, kéo thả, hoặc dán (⌘V) ảnh chụp màn hình</span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()}>
                    <Camera /> Chụp bill
                  </Button>
                  <Button type="button" variant="outline" onClick={() => galleryRef.current?.click()}>
                    <ImagePlus /> {image ? 'Đổi ảnh' : 'Chọn ảnh'}
                  </Button>
                </div>

                {parse.isPending && image && (
                  <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <ScanLine className="size-4" /> Đang đọc bill…
                  </p>
                )}
                {parse.error && <p className="text-sm text-destructive">{parse.error.message}</p>}

                {!image && (
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => {
                          setText(ex);
                          inputRef.current?.focus();
                        }}
                        className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                )}
              </motion.form>
            ) : (
              <motion.div key="manual" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
                {dashboard && <ManualTxForm dashboard={dashboard} onDone={() => onOpenChange(false)} />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {reviewing ? (
          <DrawerFooter className="grid grid-cols-2">
            <Button variant="outline" size="lg" onClick={() => setDrafts(null)}>
              Sửa lại
            </Button>
            <Button size="lg" onClick={save} disabled={total === 0 || saving}>
              {saving && <Loader2 className="animate-spin" />}
              Lưu {total} mục
            </Button>
          </DrawerFooter>
        ) : (
          <div className="h-4" />
        )}
      </DrawerContent>
    </Drawer>
  );
}
