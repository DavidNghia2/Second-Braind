-- Attachments can be referenced by more than one note. Keep the old note_id
-- column as provenance for compatibility while relationships live here.
CREATE TABLE IF NOT EXISTS note_attachments (
  note_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (note_id, attachment_id),
  FOREIGN KEY (note_id) REFERENCES notes(id),
  FOREIGN KEY (attachment_id) REFERENCES attachments(id)
);

INSERT OR IGNORE INTO note_attachments (note_id, attachment_id, created_at, deleted_at)
SELECT note_id, id, created_at, deleted_at
FROM attachments;

-- Version 7 stored Trash state on the shared attachment itself. That state
-- now belongs to each note relation, so it must not hide another note's file.
UPDATE attachments SET deleted_at = NULL;

CREATE INDEX IF NOT EXISTS idx_note_attachments_attachment_id
  ON note_attachments(attachment_id);
CREATE INDEX IF NOT EXISTS idx_note_attachments_deleted_at
  ON note_attachments(deleted_at);
