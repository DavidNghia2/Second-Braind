CREATE TABLE IF NOT EXISTS link_previews (
  id TEXT PRIMARY KEY NOT NULL,
  note_id TEXT NOT NULL,
  url TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'generic',
  title TEXT,
  description TEXT,
  image_url TEXT,
  site_name TEXT,
  display_mode TEXT NOT NULL DEFAULT 'card',
  metadata_json TEXT,
  fetched_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_link_previews_note_url ON link_previews(note_id, url);
CREATE INDEX IF NOT EXISTS idx_link_previews_note_id ON link_previews(note_id);
