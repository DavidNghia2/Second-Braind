import { database } from "./database";
import type { Attachment, Folder, LinkPreview, Note, NotePatch, StorageLocation } from "./types";

const noteColumns = "id, folder_id, title, content, content_format, content_json, legacy_markdown, is_favorite, is_pinned, created_at, updated_at, deleted_at";
const attachmentColumns = "id, note_id, storage_location_id, original_name, stored_name, mime_type, size_bytes, storage_mode, relative_path, external_path, display_mode, caption, width_mode, created_at, deleted_at";
const linkPreviewColumns = "id, note_id, url, provider, title, description, image_url, site_name, display_mode, metadata_json, fetched_at, created_at";

export const noteRepository = {
  async list(): Promise<Note[]> {
    return (await database()).select<Note[]>(
      `SELECT ${noteColumns} FROM notes ORDER BY is_pinned DESC, updated_at DESC`,
    );
  },

  async create(folderId: string | null = null): Promise<Note> {
    const timestamp = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      folder_id: folderId,
      title: "",
      content: "",
      content_format: "richtext",
      content_json: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
      legacy_markdown: null,
      is_favorite: 0,
      is_pinned: 0,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    };
    await (await database()).execute(
      "INSERT INTO notes (id, folder_id, title, content, content_format, content_json, legacy_markdown, is_favorite, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [note.id, folderId, "", "", "richtext", note.content_json, null, 0, 0, timestamp, timestamp],
    );
    return note;
  },

  async update(note: Note): Promise<Note> {
    const updated_at = new Date().toISOString();
    await (await database()).execute(
      "UPDATE notes SET folder_id = ?, title = ?, content = ?, content_format = ?, content_json = ?, legacy_markdown = ?, is_favorite = ?, is_pinned = ?, updated_at = ? WHERE id = ?",
      [note.folder_id, note.title, note.content, note.content_format, note.content_json, note.legacy_markdown, note.is_favorite, note.is_pinned, updated_at, note.id],
    );
    return { ...note, updated_at };
  },

  async patch(id: string, patch: NotePatch): Promise<Note | null> {
    const rows = await (await database()).select<Note[]>(`SELECT ${noteColumns} FROM notes WHERE id = ?`, [id]);
    if (!rows[0]) return null;
    return this.update({ ...rows[0], ...patch });
  },

  async moveToTrash(id: string): Promise<void> {
    const timestamp = new Date().toISOString();
    await (await database()).execute("UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?", [timestamp, timestamp, id]);
  },

  async moveToTrashWithAttachments(id: string): Promise<void> {
    const db = await database();
    const timestamp = new Date().toISOString();
    await db.execute("UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL", [timestamp, timestamp, id]);
    await db.execute("UPDATE note_attachments SET deleted_at = ? WHERE note_id = ? AND deleted_at IS NULL", [timestamp, id]);
  },

  async restore(id: string): Promise<void> {
    await (await database()).execute("UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
  },

  async restoreWithAttachments(id: string): Promise<void> {
    const db = await database();
    await db.execute("UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
    await db.execute("UPDATE note_attachments SET deleted_at = NULL WHERE note_id = ?", [id]);
  },

  async remove(id: string): Promise<void> {
    await (await database()).execute("DELETE FROM notes WHERE id = ?", [id]);
  },

  async permanentlyDelete(id: string): Promise<Attachment[]> {
    const db = await database();
    const linked = await db.select<Attachment[]>(`SELECT a.* FROM attachments a JOIN note_attachments na ON na.attachment_id = a.id WHERE na.note_id = ?`, [id]);
    await db.execute("DELETE FROM note_attachments WHERE note_id = ?", [id]);
    await db.execute("DELETE FROM link_previews WHERE note_id = ?", [id]);
    await db.execute("DELETE FROM notes WHERE id = ?", [id]);
    const orphaned: Attachment[] = [];
    for (const attachment of linked) {
      const references = await db.select<{ count: number }[]>("SELECT COUNT(*) AS count FROM note_attachments WHERE attachment_id = ?", [attachment.id]);
      if (Number(references[0]?.count ?? 0) === 0) {
        await db.execute("DELETE FROM attachments WHERE id = ?", [attachment.id]);
        orphaned.push(attachment);
      }
    }
    return orphaned;
  },
};

export const folderRepository = {
  async list(): Promise<Folder[]> {
    return (await database()).select<Folder[]>("SELECT id, parent_id, name, created_at, updated_at, deleted_at FROM folders ORDER BY name COLLATE NOCASE");
  },

  async create(name: string, parentId: string | null = null): Promise<Folder> {
    const normalized = name.trim();
    if (!normalized) throw new Error("Folder name cannot be empty");
    const duplicate = await (await database()).select<Folder[]>(
      "SELECT id, parent_id, name, created_at, updated_at, deleted_at FROM folders WHERE deleted_at IS NULL AND name = ? COLLATE NOCASE AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)",
      [normalized, parentId, parentId],
    );
    if (duplicate[0]) throw new Error("A folder with this name already exists here");
    const timestamp = new Date().toISOString();
    const folder: Folder = { id: crypto.randomUUID(), parent_id: parentId, name: normalized, created_at: timestamp, updated_at: timestamp, deleted_at: null };
    await (await database()).execute("INSERT INTO folders (id, parent_id, name, normalized_name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      folder.id, folder.parent_id, folder.name, normalized.toLowerCase(), timestamp, timestamp, null,
    ]);
    return folder;
  },

  async rename(id: string, name: string): Promise<void> {
    const normalized = name.trim();
    if (!normalized) throw new Error("Folder name cannot be empty");
    const db = await database();
    const current = await db.select<Folder[]>("SELECT id, parent_id, name, created_at, updated_at, deleted_at FROM folders WHERE id = ?", [id]);
    if (!current[0]) throw new Error("Folder not found");
    const duplicate = await db.select<Folder[]>("SELECT id, parent_id, name, created_at, updated_at, deleted_at FROM folders WHERE id <> ? AND deleted_at IS NULL AND name = ? COLLATE NOCASE AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)", [id, normalized, current[0].parent_id, current[0].parent_id]);
    if (duplicate[0]) throw new Error("A folder with this name already exists here");
    await db.execute("UPDATE folders SET name = ?, normalized_name = ?, updated_at = ? WHERE id = ?", [normalized, normalized.toLowerCase(), new Date().toISOString(), id]);
  },

  async softDeleteTree(id: string): Promise<void> {
    const db = await database();
    const timestamp = new Date().toISOString();
    const ids = await db.select<{ id: string }[]>("WITH RECURSIVE tree(id) AS (SELECT id FROM folders WHERE id = ? UNION ALL SELECT folders.id FROM folders JOIN tree ON folders.parent_id = tree.id) SELECT id FROM tree", [id]);
    if (!ids.length) throw new Error("Folder not found");
    const placeholders = ids.map(() => "?").join(",");
    const folderIds = ids.map((row) => row.id);
    await db.execute(`UPDATE folders SET deleted_at = ?, updated_at = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL`, [timestamp, timestamp, ...folderIds]);
    await db.execute(`UPDATE notes SET deleted_at = ?, updated_at = ? WHERE folder_id IN (${placeholders}) AND deleted_at IS NULL`, [timestamp, timestamp, ...folderIds]);
    await db.execute(`UPDATE note_attachments SET deleted_at = ? WHERE note_id IN (SELECT id FROM notes WHERE folder_id IN (${placeholders})) AND deleted_at IS NULL`, [timestamp, ...folderIds]);
  },
  async restoreTree(id: string): Promise<void> {
    const db = await database();
    const ids = await db.select<{ id: string }[]>("WITH RECURSIVE tree(id) AS (SELECT id FROM folders WHERE id = ? UNION ALL SELECT folders.id FROM folders JOIN tree ON folders.parent_id = tree.id) SELECT id FROM tree", [id]);
    if (!ids.length) throw new Error("Folder not found");
    const placeholders = ids.map(() => "?").join(","); const folderIds = ids.map((row) => row.id);
    await db.execute(`UPDATE folders SET deleted_at = NULL, updated_at = ? WHERE id IN (${placeholders})`, [new Date().toISOString(), ...folderIds]);
    await db.execute(`UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE folder_id IN (${placeholders})`, [new Date().toISOString(), ...folderIds]);
    await db.execute(`UPDATE note_attachments SET deleted_at = NULL WHERE note_id IN (SELECT id FROM notes WHERE folder_id IN (${placeholders}))`, folderIds);
  },
};

export const storageRepository = {
  async listLocations(): Promise<StorageLocation[]> {
    return (await database()).select<StorageLocation[]>("SELECT id, path, created_at, last_used_at FROM storage_locations ORDER BY last_used_at DESC");
  },

  async ensureLocation(path: string): Promise<StorageLocation> {
    const timestamp = new Date().toISOString();
    const existing = await (await database()).select<StorageLocation[]>("SELECT id, path, created_at, last_used_at FROM storage_locations WHERE path = ?", [path]);
    if (existing[0]) {
      await (await database()).execute("UPDATE storage_locations SET last_used_at = ? WHERE id = ?", [timestamp, existing[0].id]);
      return { ...existing[0], last_used_at: timestamp };
    }
    const location = { id: crypto.randomUUID(), path, created_at: timestamp, last_used_at: timestamp };
    await (await database()).execute("INSERT INTO storage_locations (id, path, created_at, last_used_at) VALUES (?, ?, ?, ?)", [
      location.id, location.path, timestamp, timestamp,
    ]);
    return location;
  },
};

export const attachmentRepository = {
  async find(id: string): Promise<Attachment | null> {
    const rows = await (await database()).select<Attachment[]>(`SELECT ${attachmentColumns} FROM attachments WHERE id = ? AND deleted_at IS NULL`, [id]);
    return rows[0] ?? null;
  },

  async listForNote(noteId: string): Promise<Attachment[]> {
    return (await database()).select<Attachment[]>(
      "SELECT a.* FROM attachments a JOIN note_attachments na ON na.attachment_id = a.id WHERE na.note_id = ? AND na.deleted_at IS NULL AND a.deleted_at IS NULL ORDER BY na.created_at ASC",
      [noteId],
    );
  },

  async add(attachment: Omit<Attachment, "created_at" | "deleted_at">): Promise<Attachment> {
    const created_at = new Date().toISOString();
    const row = { ...attachment, created_at, deleted_at: null };
    const db = await database();
    try {
      await db.execute(
      "INSERT INTO attachments (id, note_id, storage_location_id, original_name, stored_name, mime_type, size_bytes, storage_mode, relative_path, external_path, display_mode, caption, width_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [row.id, row.note_id, row.storage_location_id, row.original_name, row.stored_name, row.mime_type, row.size_bytes, row.storage_mode, row.relative_path, row.external_path, row.display_mode, row.caption, row.width_mode, created_at],
      );
      await db.execute("INSERT INTO note_attachments (note_id, attachment_id, created_at, deleted_at) VALUES (?, ?, ?, NULL)", [row.note_id, row.id, created_at]);
    } catch (error) {
      throw error;
    }
    return row;
  },

  async update(id: string, patch: Pick<Attachment, "display_mode" | "caption" | "width_mode">): Promise<void> {
    await (await database()).execute("UPDATE attachments SET display_mode = ?, caption = ?, width_mode = ? WHERE id = ?", [patch.display_mode, patch.caption, patch.width_mode, id]);
  },

  async softDeleteForNote(noteId: string): Promise<void> {
    await (await database()).execute("UPDATE note_attachments SET deleted_at = ? WHERE note_id = ? AND deleted_at IS NULL", [new Date().toISOString(), noteId]);
  },

  async restoreForNote(noteId: string): Promise<void> {
    await (await database()).execute("UPDATE note_attachments SET deleted_at = NULL WHERE note_id = ?", [noteId]);
  },

  async listAllForNote(noteId: string): Promise<Attachment[]> {
    return (await database()).select<Attachment[]>("SELECT a.* FROM attachments a JOIN note_attachments na ON na.attachment_id = a.id WHERE na.note_id = ?", [noteId]);
  },

  async removeForNote(noteId: string): Promise<void> {
    await (await database()).execute("DELETE FROM note_attachments WHERE note_id = ?", [noteId]);
  },

  async unlinkFromNote(noteId: string, attachmentId: string): Promise<Attachment | null> {
    const db = await database();
    try {
      const attachments = await db.select<Attachment[]>(`SELECT ${attachmentColumns} FROM attachments WHERE id = ?`, [attachmentId]);
      await db.execute("DELETE FROM note_attachments WHERE note_id = ? AND attachment_id = ?", [noteId, attachmentId]);
      const references = await db.select<{ count: number }[]>("SELECT COUNT(*) AS count FROM note_attachments WHERE attachment_id = ?", [attachmentId]);
      const orphan = attachments[0] && Number(references[0]?.count ?? 0) === 0 ? attachments[0] : null;
      if (orphan) await db.execute("DELETE FROM attachments WHERE id = ?", [attachmentId]);
      return orphan;
    } catch (error) {
      throw error;
    }
  },

  async remove(id: string): Promise<void> {
    await (await database()).execute("DELETE FROM attachments WHERE id = ?", [id]);
  },
};

export const linkPreviewRepository = {
  async listForNote(noteId: string): Promise<LinkPreview[]> {
    return (await database()).select<LinkPreview[]>(`SELECT ${linkPreviewColumns} FROM link_previews WHERE note_id = ? ORDER BY created_at ASC`, [noteId]);
  },

  async upsert(preview: Omit<LinkPreview, "created_at">): Promise<LinkPreview> {
    const created_at = new Date().toISOString();
    const existing = await (await database()).select<LinkPreview[]>(`SELECT ${linkPreviewColumns} FROM link_previews WHERE note_id = ? AND url = ?`, [preview.note_id, preview.url]);
    if (existing[0]) {
      await (await database()).execute(
        "UPDATE link_previews SET provider = ?, title = ?, description = ?, image_url = ?, site_name = ?, display_mode = ?, metadata_json = ?, fetched_at = ? WHERE id = ?",
        [preview.provider, preview.title, preview.description, preview.image_url, preview.site_name, preview.display_mode, preview.metadata_json, preview.fetched_at, existing[0].id],
      );
      return { ...existing[0], ...preview };
    }
    const row = { ...preview, created_at };
    await (await database()).execute(
      "INSERT INTO link_previews (id, note_id, url, provider, title, description, image_url, site_name, display_mode, metadata_json, fetched_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [row.id, row.note_id, row.url, row.provider, row.title, row.description, row.image_url, row.site_name, row.display_mode, row.metadata_json, row.fetched_at, row.created_at],
    );
    return row;
  },

  async removeForNote(noteId: string): Promise<void> {
    await (await database()).execute("DELETE FROM link_previews WHERE note_id = ?", [noteId]);
  },
};
