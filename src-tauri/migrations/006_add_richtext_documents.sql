ALTER TABLE notes ADD COLUMN content_json TEXT;
ALTER TABLE notes ADD COLUMN legacy_markdown TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_content_format ON notes(content_format);
