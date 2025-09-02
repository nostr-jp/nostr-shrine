CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL,
  kind INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  received_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS visits (
  visit_id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL,
  shrine_id TEXT NOT NULL,
  visited_at TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
