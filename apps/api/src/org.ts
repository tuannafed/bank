import type { AdminUserView, MeResponse, MemberView, WorkspaceSummary } from '@bank/core';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from './env';
import { createUser, createWorkspaceStatements, membership, normEmail } from './users';

/** Users, workspaces and memberships. Mounted under /api. */
export const org = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
org.get('/me', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.name, w.kind, m.role,
            (SELECT count(*) FROM workspace_members x WHERE x.workspace_id = w.id) AS member_count
       FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = ?
      ORDER BY (w.kind = 'personal') DESC, w.created_at`,
  )
    .bind(user.id)
    .all<{ id: string; name: string; kind: WorkspaceSummary['kind']; role: WorkspaceSummary['role']; member_count: number }>();
  const body: MeResponse = {
    user,
    workspaces: results.map((r) => ({ id: r.id, name: r.name, kind: r.kind, role: r.role, memberCount: r.member_count })),
  };
  return c.json(body);
});

const profileBody = z.object({ name: z.string().trim().max(60) });

org.patch('/me', async (c) => {
  const { name } = profileBody.parse(await c.req.json());
  await c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, c.get('user').id).run();
  return c.json({ ok: true });
});

// --- admin: who may use the app -----------------------------------------------
const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user').isAdmin) throw new HTTPException(403, { message: 'Chỉ admin mới làm được việc này' });
  return next();
});

org.use('/admin/*', requireAdmin);

org.get('/admin/users', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM users ORDER BY created_at').all<{
    id: string; email: string; name: string; is_admin: number; disabled_at: string | null; created_at: string;
  }>();
  const users: AdminUserView[] = results.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    isAdmin: r.is_admin === 1,
    disabled: r.disabled_at !== null,
    createdAt: r.created_at,
  }));
  return c.json(users);
});

const inviteBody = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(60).default(''),
  isAdmin: z.boolean().default(false),
});

/** Invite = create the user and their personal workspace. They log in via Access OTP. */
org.post('/admin/users', async (c) => {
  const { email, name, isAdmin } = inviteBody.parse(await c.req.json());
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(normEmail(email)).first();
  if (exists) throw new HTTPException(409, { message: 'Email này đã có trong app' });
  const user = await createUser(c.env.DB, email, name, isAdmin);
  return c.json(user, 201);
});

const userPatch = z.object({ isAdmin: z.boolean(), disabled: z.boolean(), name: z.string().trim().max(60) }).partial();

org.patch('/admin/users/:id', async (c) => {
  const p = userPatch.parse(await c.req.json());
  const id = c.req.param('id');
  if (id === c.get('user').id && (p.isAdmin === false || p.disabled === true)) {
    throw new HTTPException(400, { message: 'Không tự gỡ quyền admin / tự khoá chính mình' });
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (p.isAdmin !== undefined) (sets.push('is_admin = ?'), vals.push(p.isAdmin ? 1 : 0));
  if (p.disabled !== undefined) sets.push(p.disabled ? "disabled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')" : 'disabled_at = NULL');
  if (p.name !== undefined) (sets.push('name = ?'), vals.push(p.name));
  if (!sets.length) throw new HTTPException(400, { message: 'Nothing to update' });
  const res = await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
  if (!res.meta.changes) throw new HTTPException(404, { message: 'Not found' });
  return c.json({ ok: true });
});

// --- workspaces ------------------------------------------------------------------
async function requireRole(c: { env: AppEnv['Bindings'] }, wsId: string, userId: string, need: 'owner' | 'member') {
  const m = await membership(c.env.DB, wsId, userId);
  if (!m) throw new HTTPException(404, { message: 'Không tìm thấy không gian' });
  if (need === 'owner' && m.role !== 'owner') throw new HTTPException(403, { message: 'Chỉ chủ nhóm mới làm được việc này' });
  return m;
}

const wsBody = z.object({ name: z.string().trim().min(1).max(60) });

/** Create a shared workspace (e.g. "Gia đình"); the creator becomes owner. */
org.post('/workspaces', async (c) => {
  const { name } = wsBody.parse(await c.req.json());
  const id = crypto.randomUUID();
  await c.env.DB.batch(createWorkspaceStatements(c.env.DB, { id, name, kind: 'shared', ownerId: c.get('user').id }));
  return c.json({ id, name }, 201);
});

org.patch('/workspaces/:id', async (c) => {
  const { name } = wsBody.parse(await c.req.json());
  const id = c.req.param('id');
  await requireRole(c, id, c.get('user').id, 'owner');
  await c.env.DB.prepare('UPDATE workspaces SET name = ? WHERE id = ?').bind(name, id).run();
  return c.json({ ok: true });
});

/** Delete a shared workspace and all its data. Personal workspaces cannot be deleted. */
org.delete('/workspaces/:id', async (c) => {
  const id = c.req.param('id');
  await requireRole(c, id, c.get('user').id, 'owner');
  const ws = await c.env.DB.prepare('SELECT kind FROM workspaces WHERE id = ?').bind(id).first<{ kind: string }>();
  if (ws?.kind !== 'shared') throw new HTTPException(400, { message: 'Không xoá được không gian cá nhân' });
  const db = c.env.DB;
  // Children first: transactions reference debts/goals with RESTRICT.
  await db.batch([
    db.prepare('DELETE FROM transactions WHERE workspace_id = ?').bind(id),
    db.prepare('DELETE FROM debts WHERE workspace_id = ?').bind(id),
    db.prepare('DELETE FROM goals WHERE workspace_id = ?').bind(id),
    db.prepare('DELETE FROM budgets WHERE workspace_id = ?').bind(id),
    db.prepare('DELETE FROM settings WHERE workspace_id = ?').bind(id),
    db.prepare('DELETE FROM workspace_members WHERE workspace_id = ?').bind(id),
    db.prepare('DELETE FROM workspaces WHERE id = ?').bind(id),
  ]);
  return c.body(null, 204);
});

org.get('/workspaces/:id/members', async (c) => {
  const id = c.req.param('id');
  await requireRole(c, id, c.get('user').id, 'member');
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, m.role FROM workspace_members m JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = ? ORDER BY (m.role = 'owner') DESC, m.joined_at`,
  )
    .bind(id)
    .all<{ id: string; email: string; name: string; role: MemberView['role'] }>();
  const members: MemberView[] = results.map((r) => ({ userId: r.id, email: r.email, name: r.name, role: r.role }));
  return c.json(members);
});

const memberBody = z.object({ email: z.string().trim().email(), role: z.enum(['owner', 'member']).default('member') });

/** Add an existing app user to a shared workspace. */
org.post('/workspaces/:id/members', async (c) => {
  const id = c.req.param('id');
  const { email, role } = memberBody.parse(await c.req.json());
  await requireRole(c, id, c.get('user').id, 'owner');
  const ws = await c.env.DB.prepare('SELECT kind FROM workspaces WHERE id = ?').bind(id).first<{ kind: string }>();
  if (ws?.kind !== 'shared') throw new HTTPException(400, { message: 'Không gian cá nhân không thêm được thành viên. Hãy tạo nhóm.' });
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND disabled_at IS NULL')
    .bind(normEmail(email))
    .first<{ id: string }>();
  if (!user) throw new HTTPException(404, { message: `${email} chưa có trong app. Admin cần mời trước.` });
  await c.env.DB.prepare(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = excluded.role`,
  )
    .bind(id, user.id, role)
    .run();
  return c.json({ ok: true }, 201);
});

/** Owners remove anyone; members can remove themselves (leave). The last owner cannot leave. */
org.delete('/workspaces/:id/members/:userId', async (c) => {
  const id = c.req.param('id');
  const target = c.req.param('userId');
  const me = c.get('user');
  await requireRole(c, id, me.id, target === me.id ? 'member' : 'owner');
  const ws = await c.env.DB.prepare('SELECT kind FROM workspaces WHERE id = ?').bind(id).first<{ kind: string }>();
  if (ws?.kind === 'personal') throw new HTTPException(400, { message: 'Không rời được không gian cá nhân' });
  const owners = await c.env.DB.prepare(
    "SELECT count(*) AS n FROM workspace_members WHERE workspace_id = ? AND role = 'owner' AND user_id <> ?",
  )
    .bind(id, target)
    .first<{ n: number }>();
  const targetRole = await membership(c.env.DB, id, target);
  if (!targetRole) throw new HTTPException(404, { message: 'Không phải thành viên' });
  if (targetRole.role === 'owner' && (owners?.n ?? 0) === 0) {
    throw new HTTPException(400, { message: 'Nhóm cần ít nhất một chủ nhóm' });
  }
  await c.env.DB.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').bind(id, target).run();
  return c.body(null, 204);
});
