-- Rebuild folders to remove the legacy global UNIQUE(name) constraint.
-- This migration runs after v7, whose contents must remain immutable.
PRAGMA foreign_keys = OFF;

CREATE TABLE folders_new (
  id TEXT PRIMARY KEY NOT NULL,
  parent_id TEXT REFERENCES folders_new(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO folders_new (id, parent_id, name, normalized_name, created_at, updated_at, deleted_at)
SELECT id, parent_id, name, lower(trim(name)), created_at, updated_at, deleted_at
FROM folders;

DROP TABLE folders;
ALTER TABLE folders_new RENAME TO folders;

CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_folders_deleted_at ON folders(deleted_at);

CREATE UNIQUE INDEX idx_folders_active_root_name
  ON folders(normalized_name)
  WHERE parent_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_folders_active_child_name
  ON folders(parent_id, normalized_name)
  WHERE parent_id IS NOT NULL AND deleted_at IS NULL;

PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
