import type { AppUser, Env } from './env';

interface UserRow {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  disabled_at: string | null;
}

const toUser = (r: UserRow): AppUser => ({ id: r.id, email: r.email, name: r.name, isAdmin: r.is_admin === 1 });

export const normEmail = (e: string) => e.trim().toLowerCase();

export function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? '').split(',').map(normEmail).filter(Boolean);
}

/** Default budget buckets for a new workspace (slug drives the icon in the UI). */
const DEFAULT_BUDGETS: [slug: string, name: string, kind: string][] = [
  ['rent', 'Tiền nhà', 'fixed'],
  ['car', 'Trả góp xe', 'fixed'],
  ['childcare', 'Con nhỏ', 'fixed'],
  ['parents', 'Bố mẹ (y tế / hỗ trợ)', 'support'],
  ['living', 'Sinh hoạt', 'living'],
  ['growth', 'Phát triển / AI tools', 'growth'],
  ['debt-payoff', 'Trả nợ', 'debt'],
  ['ef-saving', 'Quỹ khẩn cấp', 'savings'],
];

/** Statements that create a workspace with its default budgets and goals. */
export function createWorkspaceStatements(
  db: D1Database,
  ws: { id: string; name: string; kind: 'personal' | 'shared'; ownerId: string },
): D1PreparedStatement[] {
  return [
    db.prepare('INSERT INTO workspaces (id, name, kind, created_by) VALUES (?, ?, ?, ?)').bind(ws.id, ws.name, ws.kind, ws.ownerId),
    db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')").bind(ws.id, ws.ownerId),
    ...DEFAULT_BUDGETS.map(([slug, name, kind], i) =>
      db
        .prepare('INSERT INTO budgets (id, workspace_id, slug, name, kind, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), ws.id, slug, name, kind, i + 1),
    ),
    db
      .prepare("INSERT INTO goals (id, workspace_id, kind, name, target_vnd) VALUES (?, ?, 'debt_freedom', 'Hết nợ', 0)")
      .bind(crypto.randomUUID(), ws.id),
    db
      .prepare("INSERT INTO goals (id, workspace_id, kind, name, target_vnd) VALUES (?, ?, 'emergency_fund', 'Quỹ khẩn cấp', 0)")
      .bind(crypto.randomUUID(), ws.id),
  ];
}

/** Create a user plus their personal workspace. */
export async function createUser(db: D1Database, email: string, name: string, isAdmin: boolean): Promise<AppUser> {
  const id = crypto.randomUUID();
  const user: AppUser = { id, email: normEmail(email), name: name.trim(), isAdmin };
  await db.batch([
    db.prepare('INSERT INTO users (id, email, name, is_admin) VALUES (?, ?, ?, ?)').bind(id, user.email, user.name, isAdmin ? 1 : 0),
    ...createWorkspaceStatements(db, { id: crypto.randomUUID(), name: 'Cá nhân', kind: 'personal', ownerId: id }),
  ]);
  return user;
}

export type ResolveResult = { ok: true; user: AppUser } | { ok: false; reason: 'not_invited' | 'disabled' };

/**
 * Map a verified email to an app user. Unknown emails are rejected unless they
 * are listed in ADMIN_EMAILS; the first such admin also claims the data that
 * existed before multi-user ('ws-legacy').
 */
export async function resolveUser(env: Env, rawEmail: string): Promise<ResolveResult> {
  const db = env.DB;
  const email = normEmail(rawEmail);
  const row = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (row) return row.disabled_at ? { ok: false, reason: 'disabled' } : { ok: true, user: toUser(row) };
  if (!adminEmails(env).includes(email)) return { ok: false, reason: 'not_invited' };

  const legacy = await db
    .prepare(
      `SELECT w.id FROM workspaces w
        WHERE w.id = 'ws-legacy' AND NOT EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id)`,
    )
    .first<{ id: string }>();
  if (!legacy) return { ok: true, user: await createUser(db, email, '', true) };

  const id = crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT INTO users (id, email, name, is_admin) VALUES (?, ?, ?, 1)').bind(id, email, ''),
    db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('ws-legacy', ?, 'owner')").bind(id),
    db.prepare("UPDATE workspaces SET created_by = ? WHERE id = 'ws-legacy'").bind(id),
  ]);
  return { ok: true, user: { id, email, name: '', isAdmin: true } };
}

export async function membership(db: D1Database, workspaceId: string, userId: string) {
  return db
    .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .bind(workspaceId, userId)
    .first<{ role: 'owner' | 'member' }>();
}

export async function personalWorkspaceId(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT w.id FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
        WHERE m.user_id = ? ORDER BY (w.kind = 'personal') DESC, m.joined_at LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: string }>();
  return row?.id ?? null;
}
