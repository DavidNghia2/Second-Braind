import { RotateCcw, Search, Trash2, TriangleAlert, X } from "lucide-react";
import type { Folder, Note } from "../notes/types";
import { TrashActionBar } from "./TrashActionBar";
import { TrashFolderPreview } from "./TrashFolderPreview";
import { TrashList } from "./TrashList";
import { TrashNotePreview } from "./TrashNotePreview";
import { trashItemKey, type TrashSort } from "./trashModel";

export { type TrashSort } from "./trashModel";

export function TrashSidebar({ language, notes, folders, query, sort, selectedNoteId, selectedFolderId, checkedKeys, onQueryChange, onSortChange, onSelectNote, onSelectFolder, onToggleChecked, onToggleAll, onRestoreAll, onEmptyTrash }: {
  language: "vi" | "en";
  notes: Note[];
  folders: Folder[];
  query: string;
  sort: TrashSort;
  selectedNoteId: string | null;
  selectedFolderId: string | null;
  checkedKeys: Set<string>;
  onQueryChange: (value: string) => void;
  onSortChange: (value: TrashSort) => void;
  onSelectNote: (id: string) => void;
  onSelectFolder: (id: string) => void;
  onToggleChecked: (key: string) => void;
  onToggleAll: () => void;
  onRestoreAll: () => void;
  onEmptyTrash: () => void;
}) {
  const vi = language === "vi";
  const total = notes.length + folders.length;
  const allKeys = [...notes.map((note) => trashItemKey("note", note.id)), ...folders.map((folder) => trashItemKey("folder", folder.id))];
  const allChecked = total > 0 && allKeys.every((key) => checkedKeys.has(key));
  return <div className="trash-sidebar"><header className="trash-sidebar-header"><span className="eyebrow">SECOND BRAIN</span><h2>{vi ? "Thùng rác" : "Trash"}</h2><p>{total} {vi ? "mục đã xóa" : "deleted items"}</p></header><div className="trash-sidebar-actions"><button className="primary-button" disabled={!total} onClick={onRestoreAll}><RotateCcw size={15} />{vi ? "Khôi phục tất cả" : "Restore all"}</button><button className="secondary-button" disabled={!total} onClick={onEmptyTrash}><Trash2 size={15} />{vi ? "Dọn sạch" : "Empty trash"}</button></div><label className="trash-search"><Search size={15} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={vi ? "Tìm trong thùng rác..." : "Search trash..."} />{query && <button onClick={() => onQueryChange("")}><X size={14} /></button>}</label><select className="trash-sort" value={sort} onChange={(event) => onSortChange(event.target.value as TrashSort)}><option value="deleted-desc">{vi ? "Mới xóa gần đây" : "Recently deleted"}</option><option value="deleted-asc">{vi ? "Cũ hơn trước" : "Oldest deleted"}</option><option value="title-asc">{vi ? "Tên A–Z" : "Name A–Z"}</option></select><div className="trash-select-row"><button className={`trash-check ${allChecked ? "checked" : ""}`} onClick={onToggleAll} aria-label={vi ? "Chọn tất cả" : "Select all"} /><span>{vi ? `Đã chọn ${checkedKeys.size} / ${total} mục` : `${checkedKeys.size} / ${total} selected`}</span></div><TrashList language={language} notes={notes} folders={folders} query={query} sort={sort} selectedNoteId={selectedNoteId} selectedFolderId={selectedFolderId} checkedKeys={checkedKeys} onSelectNote={onSelectNote} onSelectFolder={onSelectFolder} onToggleChecked={onToggleChecked} /></div>;
}

export function TrashMain({ language, note, folder, notes, folders, checkedCount, onRestoreNote, onDeleteNote, onRestoreFolder, onDeleteFolder, onRestoreSelected, onDeleteSelected, onClearSelection }: {
  language: "vi" | "en";
  note: Note | null;
  folder: Folder | null;
  notes: Note[];
  folders: Folder[];
  checkedCount: number;
  onRestoreNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  onRestoreFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onRestoreSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
}) {
  const vi = language === "vi";
  const total = notes.length + folders.length;
  return <section className="trash-view"><div className="trash-warning"><TriangleAlert size={17} /><span>{vi ? "Các mục trong Thùng rác được lưu tạm thời. Xóa vĩnh viễn không thể hoàn tác." : "Items in Trash are temporary. Permanent deletion cannot be undone."}</span></div>{folder ? <TrashFolderPreview language={language} folder={folder} folders={folders} notes={notes} onRestore={onRestoreFolder} onDelete={onDeleteFolder} /> : note ? <TrashNotePreview language={language} note={note} folders={folders} onRestore={onRestoreNote} onDelete={onDeleteNote} /> : <div className="trash-empty-main"><Trash2 size={38} /><h1>{vi ? "Thùng rác" : "Trash"}</h1><p>{total ? (vi ? "Chọn một ghi chú hoặc thư mục để xem chi tiết." : "Select a note or folder to view details.") : (vi ? "Thùng rác đang trống." : "Trash is empty.")}</p></div>}<TrashActionBar language={language} count={checkedCount} onRestore={onRestoreSelected} onDelete={onDeleteSelected} onClear={onClearSelection} /></section>;
}
