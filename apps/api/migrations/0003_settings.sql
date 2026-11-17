-- App settings editable from the UI (previously env vars).
CREATE TABLE settings (
  key        TEXT PRIMARY KEY CHECK (key IN ('monthly_debt_budget_vnd')),
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO settings (key, value) VALUES ('monthly_debt_budget_vnd', '28000000');
