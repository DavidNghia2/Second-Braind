CREATE TABLE IF NOT EXISTS storage_locations (
  id TEXT PRIMARY KEY NOT NULL,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY NOT NULL,
  note_id TEXT NOT NULL,
  storage_location_id TEXT,
  original_name TEXT NOT NULL,
  stored_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_mode TEXT NOT NULL DEFAULT 'managed',
  relative_path TEXT,
  external_path TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (note_id) REFERENCES notes(id),
  FOREIGN KEY (storage_location_id) REFERENCES storage_locations(id)
);

CREATE INDEX IF NOT EXISTS idx_attachments_note_id ON attachments(note_id);
CREATE INDEX IF NOT EXISTS idx_attachments_deleted_at ON attachments(deleted_at);
CREATE INDEX IF NOT EXISTS idx_attachments_storage_location_id ON attachments(storage_location_id);
