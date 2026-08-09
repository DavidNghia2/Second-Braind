import type { Folder, Note } from "../notes/types";

export type TrashSort = "deleted-desc" | "deleted-asc" | "title-asc";
export type TrashItemKind = "note" | "folder";
export type TrashItemRef = { kind: TrashItemKind; id: string };

export const trashItemKey = (kind: TrashItemKind, id: string) => `${kind}:${id}`;

export const parseTrashItemKey = (key: string): TrashItemRef | null => {
  const separator = key.indexOf(":");
  if (separator < 1) return null;
  const kind = key.slice(0, separator);
  return kind === "note" || kind === "folder" ? { kind, id: key.slice(separator + 1) } : null;
};

export const sortDeleted = <T extends { deleted_at: string | null }>(items: T[], sort: TrashSort, label: (item: T) => string) =>
  [...items].sort((left, right) => sort === "deleted-asc"
    ? String(left.deleted_at ?? "").localeCompare(String(right.deleted_at ?? ""))
    : sort === "title-asc"
      ? label(left).localeCompare(label(right))
      : String(right.deleted_at ?? "").localeCompare(String(left.deleted_at ?? "")));

export const deletedFolderRoots = (folders: Folder[]) => {
  const deletedIds = new Set(folders.filter((folder) => folder.deleted_at).map((folder) => folder.id));
  return folders.filter((folder) => folder.deleted_at && (!folder.parent_id || !deletedIds.has(folder.parent_id)));
};

export const descendantFolderIds = (rootId: string, folders: Folder[]) => {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
};

export const notesInFolderTree = (rootId: string, folders: Folder[], notes: Note[]) => {
  const folderIds = descendantFolderIds(rootId, folders);
  return notes.filter((note) => Boolean(note.folder_id && folderIds.has(note.folder_id)));
};

export const standaloneDeletedNotes = (notes: Note[], folders: Folder[]) => {
  const deletedFolderIds = new Set(folders.filter((folder) => folder.deleted_at).map((folder) => folder.id));
  return notes.filter((note) => note.deleted_at && (!note.folder_id || !deletedFolderIds.has(note.folder_id)));
};

export const resolveTrashSelection = (keys: Iterable<string>, notes: Note[], folders: Folder[], mode: "restore" | "delete" = "delete") => {
  const refs = [...keys].map(parseTrashItemKey).filter((item): item is TrashItemRef => Boolean(item));
  const selectedFolders = folders.filter((folder) => folder.deleted_at && refs.some((item) => item.kind === "folder" && item.id === folder.id));
  const selectedFolderIds = new Set(selectedFolders.map((folder) => folder.id));
  const rootFolders = selectedFolders.filter((folder) => !folder.parent_id || !selectedFolderIds.has(folder.parent_id));
  const coveredNoteIds = new Set(rootFolders.flatMap((folder) => notesInFolderTree(folder.id, folders, notes)
    .filter((note) => mode === "delete" || note.deleted_at === folder.deleted_at)
    .map((note) => note.id)));
  const selectedNotes = notes.filter((note) => note.deleted_at && refs.some((item) => item.kind === "note" && item.id === note.id) && !coveredNoteIds.has(note.id));
  return { folders: rootFolders, notes: selectedNotes, coveredNoteIds };
};
