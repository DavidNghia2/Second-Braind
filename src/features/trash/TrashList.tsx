import { FileText, Folder, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Folder as FolderType, Note } from "../notes/types";
import { TrashFolderItem } from "./TrashFolderItem";
import { deletedFolderRoots, sortDeleted, standaloneDeletedNotes, trashItemKey, type TrashSort } from "./trashModel";

const formatDeletedAt = (value: string | null, language: "vi" | "en") => value ? new Date(value).toLocaleString(language === "vi" ? "vi-VN" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export function TrashList({ language, notes, folders, query, sort, selectedNoteId, selectedFolderId, checkedKeys, onSelectNote, onSelectFolder, onToggleChecked }: {
  language: "vi" | "en";
  notes: Note[];
  folders: FolderType[];
  query: string;
  sort: TrashSort;
  selectedNoteId: string | null;
  selectedFolderId: string | null;
  checkedKeys: Set<string>;
  onSelectNote: (id: string) => void;
  onSelectFolder: (id: string) => void;
  onToggleChecked: (key: string) => void;
}) {
  const vi = language === "vi";
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const normalized = query.trim().toLocaleLowerCase(vi ? "vi-VN" : "en-US");
  const matchesNote = (note: Note) => !normalized || `${note.title} ${note.content}`.toLocaleLowerCase(vi ? "vi-VN" : "en-US").includes(normalized);
  const visibleNotes = useMemo(() => sortDeleted(standaloneDeletedNotes(notes, folders).filter(matchesNote), sort, (note) => note.title || ""), [folders, notes, normalized, sort]);
  const visibleFolders = useMemo(() => sortDeleted(deletedFolderRoots(folders).filter((folder) => {
    if (!normalized || folder.name.toLocaleLowerCase(vi ? "vi-VN" : "en-US").includes(normalized)) return true;
    const ids = new Set<string>([folder.id]);
    let changed = true;
    while (changed) { changed = false; folders.forEach((item) => { if (item.parent_id && ids.has(item.parent_id) && !ids.has(item.id)) { ids.add(item.id); changed = true; } }); }
    return notes.some((note) => note.deleted_at && note.folder_id && ids.has(note.folder_id) && matchesNote(note));
  }), sort, (folder) => folder.name), [folders, notes, normalized, sort]);
  const total = notes.length + folders.length;
  const toggleExpanded = (id: string) => setExpandedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  if (!total) return <div className="trash-list-empty"><Trash2 size={24} /><strong>{vi ? "Thùng rác trống" : "Trash is empty."}</strong><p>{vi ? "Ghi chú và thư mục đã xóa sẽ xuất hiện ở đây." : "Deleted notes and folders will appear here."}</p></div>;
  if (!visibleNotes.length && !visibleFolders.length) return <div className="trash-list-empty"><Search size={24} /><strong>{vi ? "Không tìm thấy kết quả" : "No results"}</strong><p>{vi ? "Hãy thử một từ khóa khác." : "Try another search term."}</p></div>;

  return <div className="trash-list">
    {visibleFolders.length > 0 && <section className="trash-folder-section"><div className="trash-section-title"><Folder size={14} />{vi ? "Thư mục đã xóa" : "Deleted folders"}<small>{visibleFolders.length}</small></div><div className="trash-folder-tree">{visibleFolders.map((folder) => <TrashFolderItem key={folder.id} language={language} folder={folder} folders={folders} notes={notes} sort={sort} selectedFolderId={selectedFolderId} selectedNoteId={selectedNoteId} checkedKeys={checkedKeys} expandedIds={expandedIds} onToggleExpanded={toggleExpanded} onSelectFolder={onSelectFolder} onSelectNote={onSelectNote} onToggleChecked={onToggleChecked} />)}</div></section>}
    {visibleNotes.length > 0 && <section className="trash-folder-section"><div className="trash-section-title"><FileText size={14} />{vi ? "Ghi chú đã xóa" : "Deleted notes"}<small>{visibleNotes.length}</small></div>{visibleNotes.map((note) => { const key = trashItemKey("note", note.id); return <article key={note.id} className={`trash-list-row ${selectedNoteId === note.id ? "active" : ""} ${checkedKeys.has(key) ? "checked" : ""}`}><button className={`trash-check ${checkedKeys.has(key) ? "checked" : ""}`} onClick={() => onToggleChecked(key)} aria-label={vi ? "Chọn ghi chú" : "Select note"} /><button className="trash-note-button" onClick={() => onSelectNote(note.id)}><FileText size={17} /><span><strong>{note.title || (vi ? "Chưa có tiêu đề" : "Untitled")}</strong><small>{formatDeletedAt(note.deleted_at, language)}</small></span></button></article>; })}</section>}
  </div>;
}
