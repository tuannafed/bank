import { Crown, Loader2, LogOut, Pencil, ShieldCheck, Trash2, UserPlus, UserX } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  setWorkspaceId,
  useAddMember,
  useAdminUsers,
  useDeleteWorkspace,
  useInviteUser,
  useMembers,
  usePatchUser,
  useRemoveMember,
  useRenameWorkspace,
  useUpdateProfile,
} from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

const initials = (name: string, email: string) => (name || email).trim().charAt(0).toUpperCase();

function Avatar({ name, email }: { name: string; email: string }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-primary">
      {initials(name, email)}
    </span>
  );
}

/** Your display name: shown on transactions you log in shared groups. */
export function ProfileCard() {
  const { me } = useWorkspace();
  const [name, setName] = useState('');
  const save = useUpdateProfile();
  useEffect(() => setName(me.data?.user.name ?? ''), [me.data?.user.name]);
  if (!me.data) return null;

  async function commit() {
    if (name.trim() === me.data?.user.name) return;
    await save.mutateAsync({ name: name.trim() });
    await me.refetch();
    toast.success('Đã đổi tên hiển thị');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bạn</CardTitle>
        <CardDescription>{me.data.user.email}</CardDescription>
        {me.data.user.isAdmin && (
          <CardAction>
            <Badge variant="accent">
              <ShieldCheck /> Admin
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="Tên hiển thị, vd: Tuấn"
          maxLength={60}
          aria-label="Tên hiển thị"
        />
      </CardContent>
    </Card>
  );
}

/** Current workspace: rename, members, leave/delete. */
export function GroupCard() {
  const { me, current, isOwner, isShared, switchTo } = useWorkspace();
  const members = useMembers(isShared ? current?.id : undefined);
  const add = useAddMember();
  const remove = useRemoveMember();
  const rename = useRenameWorkspace();
  const del = useDeleteWorkspace();
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  if (!current) return null;
  const myId = me.data?.user.id;
  const personal = me.data?.workspaces.find((w) => w.kind === 'personal');

  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (!current || !email.trim()) return;
    await add.mutateAsync({ id: current.id, email: email.trim() });
    await me.refetch();
    toast.success(`Đã thêm ${email.trim()} vào ${current.name}`);
    setEmail('');
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!current || !name.trim()) return;
    await rename.mutateAsync({ id: current.id, name: name.trim() });
    await me.refetch();
    setEditing(false);
  }

  async function leaveOrDelete(kind: 'leave' | 'delete') {
    if (!current || !myId) return;
    const msg =
      kind === 'delete'
        ? `Xoá nhóm "${current.name}" và TOÀN BỘ nợ, giao dịch, quỹ của nhóm? Không khôi phục được.`
        : `Rời nhóm "${current.name}"?`;
    if (!window.confirm(msg)) return;
    if (kind === 'delete') await del.mutateAsync(current.id);
    else await remove.mutateAsync({ id: current.id, userId: myId });
    if (personal) switchTo(personal.id);
    else setWorkspaceId(null);
    await me.refetch();
    toast.success(kind === 'delete' ? 'Đã xoá nhóm' : 'Đã rời nhóm');
  }

  return (
    <Card>
      <CardHeader>
        {editing ? (
          <form onSubmit={saveName} className="col-span-2 flex gap-2">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <Button type="submit" disabled={rename.isPending}>
              Lưu
            </Button>
          </form>
        ) : (
          <>
            <CardTitle>{current.name}</CardTitle>
            <CardDescription>
              {isShared ? 'Nhóm dùng chung: thành viên thấy và ghi chung dữ liệu.' : 'Không gian cá nhân: chỉ mình bạn thấy.'}
            </CardDescription>
            {isOwner && (
              <CardAction>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setName(current.name);
                    setEditing(true);
                  }}
                  aria-label="Đổi tên"
                >
                  <Pencil />
                </Button>
              </CardAction>
            )}
          </>
        )}
      </CardHeader>

      {isShared && (
        <CardContent className="space-y-4">
          {members.isLoading ? (
            <Skeleton className="h-24" />
          ) : (
            <ul className="divide-y">
              {members.data?.map((m, i) => (
                <motion.li key={m.userId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center gap-3 py-3">
                  <Avatar name={m.name} email={m.email} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {m.name || m.email}
                      {m.userId === myId && <span className="font-normal text-muted-foreground"> (bạn)</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                  </span>
                  {m.role === 'owner' ? (
                    <Badge variant="secondary">
                      <Crown /> Chủ nhóm
                    </Badge>
                  ) : (
                    isOwner && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground"
                        onClick={async () => {
                          if (!window.confirm(`Xoá ${m.email} khỏi nhóm?`)) return;
                          await remove.mutateAsync({ id: current.id, userId: m.userId });
                          await me.refetch();
                        }}
                        aria-label={`Xoá ${m.email} khỏi nhóm`}
                      >
                        <UserX />
                      </Button>
                    )
                  )}
                </motion.li>
              ))}
            </ul>
          )}

          {isOwner && (
            <form onSubmit={addMember} className="flex gap-2">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email thành viên" autoComplete="off" />
              <Button type="submit" size="lg" disabled={!email.trim() || add.isPending}>
                {add.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Thêm
              </Button>
            </form>
          )}
          {(add.error || remove.error) && <p className="text-sm text-destructive">{(add.error ?? remove.error)?.message}</p>}

          <Button
            variant="ghost"
            className="w-full text-destructive"
            onClick={() => leaveOrDelete(isOwner ? 'delete' : 'leave')}
            disabled={del.isPending || remove.isPending}
          >
            {isOwner ? <Trash2 /> : <LogOut />} {isOwner ? 'Xoá nhóm' : 'Rời nhóm'}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

/** Admin only: who may use the app at all. */
export function AdminUsersCard() {
  const { me } = useWorkspace();
  const isAdmin = !!me.data?.user.isAdmin;
  const users = useAdminUsers(isAdmin);
  const invite = useInviteUser();
  const patch = usePatchUser();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  if (!isAdmin) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    await invite.mutateAsync({ email: email.trim(), name: name.trim() });
    toast.success(`Đã mời ${email.trim()}. Họ đăng nhập bằng mã gửi về email.`);
    setEmail('');
    setName('');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Người dùng</CardTitle>
        <CardDescription>Chỉ email có trong danh sách này mới vào được app. Mỗi người có không gian riêng.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit} className="space-y-2">
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="off" />
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên" maxLength={60} />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={!email.trim() || invite.isPending}>
            {invite.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Mời vào app
          </Button>
          {invite.error && <p className="text-sm text-destructive">{invite.error.message}</p>}
        </form>

        {users.isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <ul className="divide-y">
            {users.data?.map((u) => {
              const self = u.id === me.data?.user.id;
              return (
                <li key={u.id} className={`flex items-center gap-3 py-3 ${u.disabled ? 'opacity-50' : ''}`}>
                  <Avatar name={u.name} email={u.email} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{u.name || u.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {u.email}
                      {u.disabled ? ' · đã khoá' : ''}
                    </span>
                  </span>
                  {u.isAdmin && <Badge variant="accent">Admin</Badge>}
                  {!self && (
                    <Button
                      size="sm"
                      variant={u.disabled ? 'secondary' : 'ghost'}
                      className={u.disabled ? '' : 'text-destructive'}
                      disabled={patch.isPending}
                      onClick={async () => {
                        if (!u.disabled && !window.confirm(`Khoá ${u.email}? Họ sẽ không vào được app (dữ liệu vẫn giữ).`)) return;
                        await patch.mutateAsync({ id: u.id, disabled: !u.disabled });
                      }}
                    >
                      {u.disabled ? 'Mở khoá' : 'Khoá'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
