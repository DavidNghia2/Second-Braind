import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import type { Folder as FolderType, Note } from "../notes/types";
import { sortDeleted, trashItemKey, type TrashSort } from "./trashModel";

export function TrashFolderItem({ language, folder, folders, notes, sort, selectedFolderId, selectedNoteId, checkedKeys, expandedIds, onToggleExpanded, onSelectFolder, onSelectNote, onToggleChecked, depth = 0 }: {
  language: "vi" | "en";
  folder: FolderType;
  folders: FolderType[];
  notes: Note[];
  sort: TrashSort;
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  checkedKeys: Set<string>;
  expandedIds: Set<string>;
  onToggleExpanded: (id: string) => void;
  onSelectFolder: (id: string) => void;
  onSelectNote: (id: string) => void;
  onToggleChecked: (key: string) => void;
  depth?: number;
}) {
  const vi = language === "vi";
  const children = sortDeleted(folders.filter((item) => item.deleted_at && item.parent_id === folder.id), sort, (item) => item.name);
  const directNotes = sortDeleted(notes.filter((note) => note.deleted_at && note.folder_id === folder.id), sort, (note) => note.title || "");
  const expanded = expandedIds.has(folder.id);
  const folderKey = trashItemKey("folder", folder.id);
  const hasChildren = children.length > 0 || directNotes.length > 0;
  return <div className="trash-folder-group" style={{ paddingLeft: `${depth * 10}px` }}>
    <div className={`trash-folder-row ${selectedFolderId === folder.id ? "active" : ""} ${checkedKeys.has(folderKey) ? "checked" : ""}`}>
      <button className={`trash-check ${checkedKeys.has(folderKey) ? "checked" : ""}`} onClick={() => onToggleChecked(folderKey)} aria-label={vi ? "Chọn thư mục" : "Select folder"} />
      <button className="trash-folder-toggle" onClick={() => onToggleExpanded(folder.id)} aria-label={expanded ? (vi ? "Thu gọn" : "Collapse") : (vi ? "Mở rộng" : "Expand")}>{hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span />}</button>
      <button className="trash-folder-select" onClick={() => onSelectFolder(folder.id)} onDoubleClick={() => onToggleExpanded(folder.id)}><Folder size={15} /><span>{folder.name}</span><small>{directNotes.length}</small></button>
    </div>
    {expanded && <div className="trash-folder-children">
      {directNotes.map((note) => { const noteKey = trashItemKey("note", note.id); return <div className={`trash-folder-note ${selectedNoteId === note.id ? "active" : ""}`} key={note.id}><button className={`trash-check ${checkedKeys.has(noteKey) ? "checked" : ""}`} onClick={() => onToggleChecked(noteKey)} aria-label={vi ? "Chọn ghi chú" : "Select note"} /><button onClick={() => onSelectNote(note.id)}><FileText size={13} /><span>{note.title || (vi ? "Chưa có tiêu đề" : "Untitled")}</span></button></div>; })}
      {children.map((child) => <TrashFolderItem key={child.id} language={language} folder={child} folders={folders} notes={notes} sort={sort} selectedFolderId={selectedFolderId} selectedNoteId={selectedNoteId} checkedKeys={checkedKeys} expandedIds={expandedIds} onToggleExpanded={onToggleExpanded} onSelectFolder={onSelectFolder} onSelectNote={onSelectNote} onToggleChecked={onToggleChecked} depth={depth + 1} />)}
    </div>}
  </div>;
}
