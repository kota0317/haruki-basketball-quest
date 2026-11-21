-- Additive migration. It preserves family_snapshot and every existing D1 row.
CREATE TABLE IF NOT EXISTS family_operation (
  operation_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  applied_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS family_operation_created_at ON family_operation(created_at);

-- A byte-for-byte copy of the old snapshot is captured before the first import.
CREATE TABLE IF NOT EXISTS family_snapshot_archive (
  source_revision INTEGER PRIMARY KEY,
  body TEXT,
  archived_at TEXT NOT NULL
);
