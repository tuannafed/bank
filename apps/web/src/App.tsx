import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { BottomNav, type Tab } from '@/components/BottomNav';
import { BudgetGrid } from '@/components/BudgetGrid';
import { DebtCard } from '@/components/DebtCard';
import { Hero } from '@/components/Hero';
import { HistoryView } from '@/components/HistoryView';
import { ManageView } from '@/components/ManageView';
import { MonthCard } from '@/components/MonthCard';
import { QuickLogDrawer } from '@/components/QuickLogDrawer';
import { RoadmapView } from '@/components/RoadmapView';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, useDashboard, useMe } from '@/lib/api';
import { fileToDataUrl } from '@/lib/image';

const TITLES: Record<Exclude<Tab, 'home'>, string> = {
  roadmap: 'Lộ trình trả nợ',
  history: 'Lịch sử giao dịch',
  manage: 'Quản lý',
};

export function App() {
  const me = useMe();
  const { data, isLoading, error, refetch, isFetching } = useDashboard();
  const [wsOpen, setWsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [logOpen, setLogOpen] = useState(false);
  const [prefill, setPrefill] = useState('');
  const [prefillImage, setPrefillImage] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const openLog = (text = '', image: string | null = null) => {
    setPrefill(text);
    setPrefillImage(image);
    setLogOpen(true);
  };

  // The picker must open inside the tap handler (iOS), so the input lives here.
  // No `capture` attribute: iOS then offers camera, photo library and files.
  async function onCameraFile(file: File | undefined) {
    if (cameraRef.current) cameraRef.current.value = '';
    if (!file) return;
    try {
      openLog('', await fileToDataUrl(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không đọc được ảnh');
    }
  }

  const meErr = me.error instanceof ApiError ? me.error : null;
  if (meErr?.status === 403) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-2xl font-bold">Chưa có quyền truy cập</p>
          <p className="text-muted-foreground">{meErr.message}. Nhờ admin mời email này vào app rồi tải lại trang.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Tải lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-32">
      {isLoading && (
        <div className="space-y-4 p-5 pt-12">
          <Skeleton className="h-64 rounded-[28px]" />
          <Skeleton className="h-48 rounded-[28px]" />
        </div>
      )}

      {error && (
        <div className="m-5 mt-12 space-y-3 rounded-[28px] bg-destructive/10 p-5 text-sm text-destructive">
          <p>Không tải được số liệu: {error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {data && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {tab === 'home' ? (
              <>
                <Hero
                  data={data}
                  refreshing={isFetching}
                  onRefresh={() => refetch()}
                  onQuickLog={() => openLog()}
                  onScan={() => cameraRef.current?.click()}
                  onOpenWorkspaces={() => setWsOpen(true)}
                  onOpenRoadmap={() => setTab('roadmap')}
                />
                <div className="relative -mt-12 space-y-4 px-4">
                  <BudgetGrid budgets={data.budgets} onPick={(name) => openLog(`Chi ${name.toLowerCase()} `)} />
                  {data.roadmap.phase === 'debt_freedom' && <MonthCard data={data} />}
                  <h2 className="px-1 pt-2 text-xl font-semibold">Các khoản nợ</h2>
                  {data.debts.map((d, i) => (
                    <DebtCard key={d.id} debt={d} index={i} />
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-4 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
                <h1 className="px-1 text-2xl font-bold tracking-tight">{TITLES[tab]}</h1>
                {tab === 'roadmap' && <RoadmapView data={data} />}
                {tab === 'history' && <HistoryView dashboard={data} />}
                {tab === 'manage' && <ManageView />}
              </div>
            )}
          </motion.main>
        </AnimatePresence>
      )}

      <WorkspaceSwitcher open={wsOpen} onOpenChange={setWsOpen} />
      <BottomNav tab={tab} onTab={setTab} onQuickLog={() => openLog()} />
      <QuickLogDrawer open={logOpen} onOpenChange={setLogOpen} prefill={prefill} prefillImage={prefillImage} dashboard={data} />
      <input ref={cameraRef} type="file" accept="image/*" hidden onChange={(e) => onCameraFile(e.target.files?.[0])} />
    </div>
  );
}
