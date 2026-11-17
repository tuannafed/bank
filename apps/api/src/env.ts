export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN: string;
  /** Optional: Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD: string;
  /** Comma-separated emails that become admins on first login (bootstrap). */
  ADMIN_EMAILS: string;
  DEEPSEEK_API_KEY: string;
  DEEPSEEK_BASE_URL: string;
  DEEPSEEK_MODEL: string;
  MONTHLY_DEBT_BUDGET_VND: string;
  /** Local only: skip Access. The X-Dev-Email header picks the user (default: first ADMIN_EMAILS). */
  DEV_BYPASS_AUTH?: string;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export type WorkspaceRole = 'owner' | 'member';

export type AppEnv = {
  Bindings: Env;
  Variables: { user: AppUser; workspaceId: string; role: WorkspaceRole };
};
