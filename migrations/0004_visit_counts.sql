CREATE TABLE IF NOT EXISTS visit_counts (
  id TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_visits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO visit_counts (id, count, updated_at) VALUES ('total', 20000, 1794970000000);
