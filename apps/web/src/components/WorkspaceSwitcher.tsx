import { Check, Loader2, Plus, User, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { useCreateWorkspace } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';
import { cn } from '@/lib/utils';

export function WorkspaceSwitcher({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { list, current, switchTo, me } = useWorkspace();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const create = useCreateWorkspace();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const ws = await create.mutateAsync({ name: name.trim() });
    await me.refetch();
    switchTo(ws.id);
    toast.success(`Đã tạo nhóm "${ws.name}". Thêm thành viên trong tab Quản lý.`);
    setName('');
    setCreating(false);
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Không gian</DrawerTitle>
          <DrawerDescription>Mỗi không gian có nợ, giao dịch và quỹ riêng.</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-3 overflow-y-auto px-5 pb-6">
          <ul className="divide-y rounded-3xl border bg-card px-2">
            {list.map((w, i) => {
              const active = w.id === current?.id;
              const Icon = w.kind === 'personal' ? User : Users;
              return (
                <motion.li key={w.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <button
                    onClick={() => {
                      switchTo(w.id);
                      onOpenChange(false);
                    }}
                    className="flex w-full items-center gap-3 px-2 py-3 text-left"
                  >
                    <span className={cn('grid size-10 place-items-center rounded-full', active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary')}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{w.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {w.kind === 'personal' ? 'Chỉ mình bạn' : `${w.memberCount} thành viên · ${w.role === 'owner' ? 'bạn là chủ nhóm' : 'thành viên'}`}
                      </span>
                    </span>
                    {active && <Check className="size-5 text-primary" />}
                  </button>
                </motion.li>
              );
            })}
          </ul>

          {creating ? (
            <form onSubmit={submit} className="flex gap-2">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên nhóm, vd: Gia đình" maxLength={60} />
              <Button type="submit" size="lg" disabled={!name.trim() || create.isPending}>
                {create.isPending ? <Loader2 className="animate-spin" /> : 'Tạo'}
              </Button>
            </form>
          ) : (
            <Button variant="outline" size="lg" className="w-full" onClick={() => setCreating(true)}>
              <Plus /> Tạo nhóm dùng chung
            </Button>
          )}
          {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
