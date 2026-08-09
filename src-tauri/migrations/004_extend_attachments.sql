ALTER TABLE attachments ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'card';
ALTER TABLE attachments ADD COLUMN caption TEXT;
ALTER TABLE attachments ADD COLUMN width_mode TEXT NOT NULL DEFAULT 'medium';

CREATE INDEX IF NOT EXISTS idx_attachments_display_mode ON attachments(display_mode);
