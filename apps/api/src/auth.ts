import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import type { AppEnv } from './env';
import { adminEmails, membership, personalWorkspaceId, resolveUser } from './users';

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Shape of Worker-level Access context (ctx.access), when Cloudflare provides it. */
interface AccessContext {
  aud?: string;
  getIdentity?: () => Promise<{ email?: string } | undefined>;
}

/**
 * 1. Prove who is calling (Cloudflare Access): ctx.access, Cf-Access-Jwt-Assertion
 *    header or CF_Authorization cookie, verified against the team's signing keys.
 * 2. Map the email to an app user (users table). Not invited -> 403.
 * Fails closed when Access is not configured.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  let email: string | undefined;

  if (c.env.DEV_BYPASS_AUTH === 'true') {
    email = c.req.header('x-dev-email') ?? adminEmails(c.env)[0];
  } else {
    const team = c.env.ACCESS_TEAM_DOMAIN?.replace(/\/cdn-cgi\/access\/certs\/?$/, '').replace(/\/$/, '');
    const aud = c.env.ACCESS_AUD?.trim() || undefined;
    if (!team) return c.json({ error: 'Access is not configured' }, 500);

    let access: AccessContext | undefined;
    try {
      access = (c.executionCtx as unknown as { access?: AccessContext }).access;
    } catch {
      access = undefined;
    }
    if (access && (!aud || access.aud === aud)) {
      email = (await access.getIdentity?.().catch(() => undefined))?.email;
    }

    if (!email) {
      const token = c.req.header('cf-access-jwt-assertion') ?? getCookie(c, 'CF_Authorization');
      if (!token) {
        console.warn('access: no token', { hasCtxAccess: !!access });
        return c.json({ error: 'Unauthorized' }, 401);
      }
      let jwks = jwksCache.get(team);
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
        jwksCache.set(team, jwks);
      }
      try {
        // Signature + issuer prove the token was minted by this Cloudflare team.
        const { payload } = await jwtVerify(token, jwks, { issuer: team, ...(aud ? { audience: aud } : {}) });
        email = typeof payload.email === 'string' ? payload.email : undefined;
      } catch (e) {
        let claims: { iss?: unknown; aud?: unknown } = {};
        try {
          const d = decodeJwt(token);
          claims = { iss: d.iss, aud: d.aud };
        } catch {
          /* not a JWT */
        }
        console.warn('access: jwt rejected', { reason: e instanceof Error ? e.message : String(e), expectedIss: team, ...claims });
        return c.json({ error: 'Unauthorized' }, 401);
      }
    }
  }

  if (!email) return c.json({ error: 'Unauthorized' }, 401);
  const res = await resolveUser(c.env, email);
  if (!res.ok) {
    return c.json(
      {
        error: res.reason === 'disabled' ? 'Tài khoản đã bị khoá' : `${email} chưa được mời vào app`,
        code: res.reason,
        email,
      },
      403,
    );
  }
  c.set('user', res.user);
  return next();
});

/** Paths that work across workspaces (they check access themselves). */
const CROSS_WORKSPACE = [/^\/api\/me$/, /^\/api\/admin(\/|$)/, /^\/api\/workspaces(\/|$)/];

/**
 * Pick the workspace for this request: X-Workspace-Id header, else the user's
 * personal workspace. The user must be a member.
 */
export const requireWorkspace = createMiddleware<AppEnv>(async (c, next) => {
  if (CROSS_WORKSPACE.some((re) => re.test(c.req.path))) return next();
  const user = c.get('user');
  const wanted = c.req.header('x-workspace-id');
  const wsId = wanted || (await personalWorkspaceId(c.env.DB, user.id));
  if (!wsId) return c.json({ error: 'Không có không gian nào' }, 403);
  const m = await membership(c.env.DB, wsId, user.id);
  if (!m) return c.json({ error: 'Bạn không thuộc không gian này', code: 'not_member' }, 403);
  c.set('workspaceId', wsId);
  c.set('role', m.role);
  return next();
});
