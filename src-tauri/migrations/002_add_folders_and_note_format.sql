CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES folders(id);
ALTER TABLE notes ADD COLUMN content_format TEXT NOT NULL DEFAULT 'markdown';
CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes(folder_id);
