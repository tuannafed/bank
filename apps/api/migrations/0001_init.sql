-- Bank app schema (Cloudflare D1 / SQLite)
-- Money: integer minor units. VND scale 1, USD/USDT scale 100 (cents).
-- Fee rates: basis points, 200 = 2.00%/month.

CREATE TABLE debts (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  type                TEXT NOT NULL CHECK (type IN ('credit_card', 'personal_loan', 'friend_debt')),
  currency            TEXT NOT NULL CHECK (currency IN ('VND', 'USD', 'USDT')),
  balance_minor       INTEGER NOT NULL CHECK (balance_minor >= 0),
  monthly_fee_rate_bp INTEGER NOT NULL DEFAULT 0 CHECK (monthly_fee_rate_bp BETWEEN 0 AND 10000),
  min_payment_minor   INTEGER NOT NULL DEFAULT 0 CHECK (min_payment_minor >= 0),
  statement_day       INTEGER CHECK (statement_day BETWEEN 1 AND 31),
  due_day             INTEGER CHECK (due_day BETWEEN 1 AND 31),
  priority_order      INTEGER,
  aliases             TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases) AND json_type(aliases) = 'array'),
  archived_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Latest known VND rate per foreign currency. Auto-updated from transactions.
CREATE TABLE fx_rates (
  currency   TEXT PRIMARY KEY CHECK (currency IN ('USD', 'USDT')),
  rate_vnd   INTEGER NOT NULL CHECK (rate_vnd > 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE budgets (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('fixed', 'support', 'living', 'growth', 'debt', 'savings')),
  monthly_limit_vnd INTEGER CHECK (monthly_limit_vnd IS NULL OR monthly_limit_vnd >= 0),
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE goals (
  id                 TEXT PRIMARY KEY,
  kind               TEXT NOT NULL UNIQUE CHECK (kind IN ('debt_freedom', 'emergency_fund')),
  name               TEXT NOT NULL,
  -- debt_freedom: total debt (VND) at plan start, used as the progress baseline.
  target_vnd         INTEGER NOT NULL CHECK (target_vnd >= 0),
  monthly_target_vnd INTEGER CHECK (monthly_target_vnd IS NULL OR monthly_target_vnd > 0),
  current_vnd        INTEGER NOT NULL DEFAULT 0,
  started_at         TEXT,
  completed_at       TEXT
);

CREATE TABLE transactions (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN ('income', 'expense', 'debt_payment', 'debt_fee', 'savings_contribution')),
  currency          TEXT NOT NULL CHECK (currency IN ('VND', 'USD', 'USDT')),
  amount_minor      INTEGER NOT NULL CHECK (amount_minor > 0),
  fx_rate_vnd       INTEGER NOT NULL CHECK (fx_rate_vnd > 0),
  -- Must match toVnd() in packages/core/src/money.ts (round half up).
  amount_vnd        INTEGER GENERATED ALWAYS AS (
                      CASE currency WHEN 'VND' THEN amount_minor
                      ELSE (amount_minor * fx_rate_vnd + 50) / 100 END
                    ) STORED,
  debt_id           TEXT REFERENCES debts (id) ON DELETE RESTRICT,
  debt_amount_minor INTEGER CHECK (debt_amount_minor IS NULL OR debt_amount_minor > 0),
  budget_id         TEXT REFERENCES budgets (id) ON DELETE SET NULL,
  goal_id           TEXT REFERENCES goals (id) ON DELETE RESTRICT,
  occurred_on       TEXT NOT NULL CHECK (occurred_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  note              TEXT NOT NULL DEFAULT '',
  source            TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  raw_input         TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CHECK (currency <> 'VND' OR fx_rate_vnd = 1),
  CHECK ((type IN ('debt_payment', 'debt_fee')) = (debt_id IS NOT NULL AND debt_amount_minor IS NOT NULL)),
  CHECK ((type = 'savings_contribution') = (goal_id IS NOT NULL))
);

CREATE INDEX idx_tx_occurred ON transactions (occurred_on DESC, created_at DESC);
CREATE INDEX idx_tx_debt ON transactions (debt_id, occurred_on) WHERE debt_id IS NOT NULL;
CREATE INDEX idx_tx_budget ON transactions (budget_id, occurred_on) WHERE budget_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Ledger is append-only: correct a mistake by deleting and re-inserting.
CREATE TRIGGER trg_tx_no_update
BEFORE UPDATE ON transactions
BEGIN
  SELECT RAISE(ABORT, 'transactions are immutable; delete and re-insert instead');
END;

-- Debt balance follows the ledger. CHECK (balance_minor >= 0) rejects overpayment.
CREATE TRIGGER trg_tx_debt_insert
AFTER INSERT ON transactions
WHEN NEW.debt_id IS NOT NULL
BEGIN
  UPDATE debts
     SET balance_minor = balance_minor
                         + CASE NEW.type WHEN 'debt_fee' THEN NEW.debt_amount_minor ELSE -NEW.debt_amount_minor END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = NEW.debt_id;
END;

CREATE TRIGGER trg_tx_debt_delete
AFTER DELETE ON transactions
WHEN OLD.debt_id IS NOT NULL
BEGIN
  UPDATE debts
     SET balance_minor = balance_minor
                         + CASE OLD.type WHEN 'debt_fee' THEN -OLD.debt_amount_minor ELSE OLD.debt_amount_minor END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = OLD.debt_id;
END;

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

-- Any foreign-currency transaction refreshes the latest known rate.
CREATE TRIGGER trg_tx_fx_rate
AFTER INSERT ON transactions
WHEN NEW.currency <> 'VND'
BEGIN
  INSERT INTO fx_rates (currency, rate_vnd) VALUES (NEW.currency, NEW.fx_rate_vnd)
  ON CONFLICT (currency) DO UPDATE
     SET rate_vnd = excluded.rate_vnd,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;

-- Phase switch: all active debts at zero -> Phase 1 complete, Phase 2 starts.
CREATE TRIGGER trg_debt_phase_done
AFTER UPDATE OF balance_minor ON debts
WHEN NOT EXISTS (SELECT 1 FROM debts WHERE balance_minor > 0 AND archived_at IS NULL)
BEGIN
  UPDATE goals SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE kind = 'debt_freedom' AND completed_at IS NULL;
  UPDATE goals SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE kind = 'emergency_fund' AND started_at IS NULL;
END;

-- Undoing the last payment (or a new fee) reopens Phase 1.
CREATE TRIGGER trg_debt_phase_reopen
AFTER UPDATE OF balance_minor ON debts
WHEN NEW.balance_minor > 0 AND NEW.archived_at IS NULL
BEGIN
  UPDATE goals SET completed_at = NULL WHERE kind = 'debt_freedom' AND completed_at IS NOT NULL;
END;
