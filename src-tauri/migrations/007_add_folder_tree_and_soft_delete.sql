ALTER TABLE folders ADD COLUMN parent_id TEXT REFERENCES folders(id);
ALTER TABLE folders ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_deleted_at ON folders(deleted_at);

-- Existing installations historically enforced global uniqueness on name.
-- SQLite cannot drop that constraint in-place; the application validates names
-- per parent before writes, while this index supports active-tree lookups.
CREATE INDEX IF NOT EXISTS idx_folders_parent_name ON folders(parent_id, name COLLATE NOCASE);
