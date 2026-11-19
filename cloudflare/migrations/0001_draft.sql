-- Draft only. Do not apply to a real database until access control and migration are approved.
CREATE TABLE sync_records (
  kind TEXT NOT NULL,
  record_key TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  value_json TEXT,
  PRIMARY KEY (kind, record_key)
);
CREATE TABLE sync_operations (
  operation_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE import_backups (
  backup_id TEXT PRIMARY KEY,
  backup_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
