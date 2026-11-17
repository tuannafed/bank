-- Multi-user: every row of business data belongs to a workspace.
--   personal workspace = one user's private data
--   shared workspace   = a group (e.g. family) whose members share the data
-- Existing data moves into 'ws-legacy'; the first admin to log in claims it.

PRAGMA defer_foreign_keys = true;

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL CHECK (email = lower(trim(email)) AND email LIKE '%_@_%'),
  name        TEXT NOT NULL DEFAULT '',
  is_admin    INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  disabled_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX ux_users_email ON users (email);

CREATE TABLE workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('personal', 'shared')),
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX idx_members_user ON workspace_members (user_id);

INSERT INTO workspaces (id, name, kind) VALUES ('ws-legacy', 'Cá nhân', 'personal');

-- debts ---------------------------------------------------------------------
ALTER TABLE debts ADD COLUMN workspace_id TEXT REFERENCES workspaces (id) ON DELETE CASCADE;
UPDATE debts SET workspace_id = 'ws-legacy';
CREATE INDEX idx_debts_ws ON debts (workspace_id);

-- budgets: slug keeps the icon/meaning when ids are per-workspace uuids ------
ALTER TABLE budgets ADD COLUMN workspace_id TEXT REFERENCES workspaces (id) ON DELETE CASCADE;
ALTER TABLE budgets ADD COLUMN slug TEXT;
UPDATE budgets SET workspace_id = 'ws-legacy', slug = id;
CREATE INDEX idx_budgets_ws ON budgets (workspace_id, sort_order);

-- transactions (append-only trigger must be lifted for the backfill) -------
DROP TRIGGER trg_tx_no_update;
ALTER TABLE transactions ADD COLUMN workspace_id TEXT REFERENCES workspaces (id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN created_by TEXT REFERENCES users (id) ON DELETE SET NULL;
UPDATE transactions SET workspace_id = 'ws-legacy';
CREATE TRIGGER trg_tx_no_update
BEFORE UPDATE ON transactions
BEGIN
  SELECT RAISE(ABORT, 'transactions are immutable; delete and re-insert instead');
END;
CREATE INDEX idx_tx_ws ON transactions (workspace_id, occurred_on DESC, created_at DESC);

-- goals: kind is unique per workspace, not globally -> rebuild --------------
-- Triggers that mention goals must go first, or the rename fails.
DROP TRIGGER trg_tx_goal_insert;
DROP TRIGGER trg_tx_goal_delete;
DROP TRIGGER trg_debt_phase_done;
DROP TRIGGER trg_debt_phase_reopen;

CREATE TABLE goals_new (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK (kind IN ('debt_freedom', 'emergency_fund')),
  name               TEXT NOT NULL,
  target_vnd         INTEGER NOT NULL CHECK (target_vnd >= 0),
  monthly_target_vnd INTEGER CHECK (monthly_target_vnd IS NULL OR monthly_target_vnd > 0),
  current_vnd        INTEGER NOT NULL DEFAULT 0,
  started_at         TEXT,
  completed_at       TEXT,
  UNIQUE (workspace_id, kind)
);
INSERT INTO goals_new (id, workspace_id, kind, name, target_vnd, monthly_target_vnd, current_vnd, started_at, completed_at)
SELECT id, 'ws-legacy', kind, name, target_vnd, monthly_target_vnd, current_vnd, started_at, completed_at FROM goals;
DROP TABLE goals;
ALTER TABLE goals_new RENAME TO goals;

CREATE TRIGGER trg_tx_goal_insert
AFTER INSERT ON transactions
WHEN NEW.goal_id IS NOT NULL
BEGIN
  UPDATE goals SET current_vnd = current_vnd + NEW.amount_vnd WHERE id = NEW.goal_id;
END;

CREATE TRIGGER trg_tx_goal_delete
AFTER DELETE ON transactions
WHEN OLD.goal_id IS NOT NULL
BEGIN
  UPDATE goals SET current_vnd = current_vnd - OLD.amount_vnd WHERE id = OLD.goal_id;
END;

-- settings: per workspace -> rebuild -----------------------------------------
CREATE TABLE settings_new (
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  key          TEXT NOT NULL CHECK (key IN ('monthly_debt_budget_vnd')),
  value        TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (workspace_id, key)
);
INSERT INTO settings_new (workspace_id, key, value, updated_at)
SELECT 'ws-legacy', key, value, updated_at FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;

-- Every new business row must say which workspace it belongs to ------------
CREATE TRIGGER trg_debts_ws_required BEFORE INSERT ON debts WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'debts.workspace_id is required'); END;
CREATE TRIGGER trg_budgets_ws_required BEFORE INSERT ON budgets WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'budgets.workspace_id is required'); END;
CREATE TRIGGER trg_tx_ws_required BEFORE INSERT ON transactions WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'transactions.workspace_id is required'); END;

-- Phase switch, now per workspace --------------------------------------------

CREATE TRIGGER trg_debt_phase_done
AFTER UPDATE OF balance_minor ON debts
WHEN NOT EXISTS (
  SELECT 1 FROM debts
   WHERE workspace_id = NEW.workspace_id AND balance_minor > 0 AND archived_at IS NULL
)
BEGIN
  UPDATE goals SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE workspace_id = NEW.workspace_id AND kind = 'debt_freedom' AND completed_at IS NULL;
  UPDATE goals SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE workspace_id = NEW.workspace_id AND kind = 'emergency_fund' AND started_at IS NULL;
END;

CREATE TRIGGER trg_debt_phase_reopen
AFTER UPDATE OF balance_minor ON debts
WHEN NEW.balance_minor > 0 AND NEW.archived_at IS NULL
BEGIN
  UPDATE goals SET completed_at = NULL
   WHERE workspace_id = NEW.workspace_id AND kind = 'debt_freedom' AND completed_at IS NOT NULL;
END;
