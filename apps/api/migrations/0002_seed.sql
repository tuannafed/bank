-- Initial scenario. ⚠ EDIT before running remotely:
--   VPBank/HSBC balances, statement/due days and the USD rate are assumptions
--   chosen so that the total is ~165M VND. Replace with your real statement figures.

INSERT INTO fx_rates (currency, rate_vnd) VALUES
  ('USDT', 25950),
  ('USD',  25950);

INSERT INTO debts (id, name, type, currency, balance_minor, monthly_fee_rate_bp, statement_day, due_day, aliases) VALUES
  ('vpbank',     'VPBank',       'credit_card', 'VND', 80000000, 200, 20, 5,  '["vp","vpb","thẻ vp","thẻ vpbank"]'),
  ('hsbc',       'HSBC',         'credit_card', 'VND', 55000000, 180, 10, 25, '["hsbc","thẻ hsbc"]'),
  ('friend-usd', 'Nợ bạn (USD)', 'friend_debt', 'USD', 50000,    0,   NULL, NULL, '["nợ bạn usd","500 đô","nợ đô"]'),
  ('friend-vnd', 'Nợ bạn (VND)', 'friend_debt', 'VND', 17000000, 0,   NULL, NULL, '["nợ bạn","17 triệu"]');

INSERT INTO budgets (id, name, kind, monthly_limit_vnd, sort_order) VALUES
  ('rent',        'Tiền nhà',               'fixed',   NULL,     1),
  ('car',         'Trả góp xe',             'fixed',   NULL,     2),
  ('childcare',   'Con nhỏ',                'fixed',   NULL,     3),
  ('parents',     'Bố mẹ (y tế / hỗ trợ)',  'support', NULL,     4),
  ('living',      'Sinh hoạt',              'living',  NULL,     5),
  ('growth',      'Phát triển / AI tools',  'growth',  NULL,     6),
  ('debt-payoff', 'Trả nợ',                 'debt',    28000000, 7),
  ('ef-saving',   'Quỹ khẩn cấp',           'savings', 38300000, 8);

-- Baseline = current total debt in VND (USD debt converted at the seeded rate).
INSERT INTO goals (id, kind, name, target_vnd, monthly_target_vnd, started_at)
SELECT 'debt-freedom', 'debt_freedom', 'Hết nợ',
       SUM(CASE d.currency WHEN 'VND' THEN d.balance_minor
           ELSE (d.balance_minor * r.rate_vnd + 50) / 100 END),
       28000000,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM debts d LEFT JOIN fx_rates r ON r.currency = d.currency;

INSERT INTO goals (id, kind, name, target_vnd, monthly_target_vnd) VALUES
  ('emergency-fund', 'emergency_fund', 'Quỹ khẩn cấp', 250000000, 38300000);
