import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Settings2, SortAsc, Star, Trash2, X } from "lucide-react";
import { useMemo, useState, type DragEvent, type MouseEvent } from "react";
import type { Folder as FolderRecord, Note } from "../notes/types";

const NOTE_MIME = "application/x-secondbrain-note";

type FilesView = { type: "all" } | { type: "folder"; folderId: string } | { type: "unfiled" };
type NoteSort = "updated" | "title";

type Props = {
  language: "vi" | "en";
  notes: Note[];
  folders: FolderRecord[];
  selectedId: string | null;
  activeView: FilesView;
  query: string;
  onQueryChange: (value: string) => void;
  onNewNote: (folderId?: string | null) => void;
  onNewFolder: (parentId?: string | null) => void;
  onSelectFolder: (folderId: string | null) => void;
  onOpenNote: (note: Note, pinned: boolean) => void;
  onMoveNote: (note: Note, folderId: string | null) => Promise<void>;
  onToggleFavorite: (note: Note) => void;
  onTrashNote: (note: Note) => void;
  onRenameFolder: (folder: FolderRecord) => void;
  onTrashFolder: (folder: FolderRecord) => void;
  onRefresh: () => void;
  onSettings: () => void;
};

export function FilesSidebarLayout({ language, notes, folders, selectedId, activeView, query, onQueryChange, onNewNote, onNewFolder, onSelectFolder, onOpenNote, onMoveNote, onToggleFavorite, onTrashNote, onRenameFolder, onTrashFolder, onRefresh, onSettings }: Props) {
  const vi = language === "vi";
  const [noteSort, setNoteSort] = useState<NoteSort>("updated");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState(new Set(["recent", "inbox", "recent-folders", "folders"]));
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const lower = (value: string) => value.toLocaleLowerCase(vi ? "vi-VN" : "en-US");
  const queryText = lower(query.trim());
  const activeNotes = useMemo(() => notes.filter((note) => !note.deleted_at), [notes]);
  const activeFolders = useMemo(() => folders.filter((folder) => !folder.deleted_at), [folders]);
  const matchesNote = (note: Note) => !queryText || lower(`${note.title} ${note.content}`).includes(queryText);
  const matchesFolder = (folder: FolderRecord) => !queryText || lower(folder.name).includes(queryText);
  const sortNotes = (items: Note[]) => [...items].sort((left, right) => noteSort === "updated" ? right.updated_at.localeCompare(left.updated_at) : (left.title || "").localeCompare(right.title || "", vi ? "vi-VN" : "en-US"));
  const recent = useMemo(() => [...activeNotes].filter(matchesNote).sort((left, right) => right.updated_at.localeCompare(left.updated_at)).slice(0, 6), [activeNotes, queryText]);
  const inbox = useMemo(() => sortNotes(activeNotes.filter((note) => note.folder_id === null && matchesNote(note))), [activeNotes, noteSort, queryText]);
  const foldersByParent = useMemo(() => {
    const index = new Map<string | null, FolderRecord[]>();
    for (const folder of activeFolders) index.set(folder.parent_id, [...(index.get(folder.parent_id) ?? []), folder]);
    index.forEach((items) => items.sort((left, right) => left.name.localeCompare(right.name, vi ? "vi-VN" : "en-US")));
    return index;
  }, [activeFolders, vi]);
  const recentFolders = useMemo(() => [...activeFolders].sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, 4), [activeFolders]);
  const descendants = (folderId: string): string[] => [folderId, ...(foldersByParent.get(folderId) ?? []).flatMap((folder) => descendants(folder.id))];
  const noteCount = (folderId: string) => activeNotes.filter((note) => descendants(folderId).includes(note.folder_id ?? "")).length;
  const treeMatches = (folder: FolderRecord): boolean => matchesFolder(folder) || activeNotes.some((note) => note.folder_id === folder.id && matchesNote(note)) || (foldersByParent.get(folder.id) ?? []).some(treeMatches);
  const toggleSection = (id: string) => setExpandedSections((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const openFolder = (folderId: string) => setExpandedFolders((current) => new Set(current).add(folderId));
  const toggleFolder = (folderId: string) => setExpandedFolders((current) => { const next = new Set(current); if (next.has(folderId)) next.delete(folderId); else next.add(folderId); return next; });
  const dragStart = (event: DragEvent<HTMLElement>, note: Note) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(NOTE_MIME, note.id); event.dataTransfer.setData("text/plain", note.title || "note"); };
  const dragOver = (event: DragEvent<HTMLElement>, target: string) => { if (!event.dataTransfer.types.includes(NOTE_MIME)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(target); };
  const drop = async (event: DragEvent<HTMLElement>, folderId: string | null) => { event.preventDefault(); setDropTarget(null); const note = activeNotes.find((item) => item.id === event.dataTransfer.getData(NOTE_MIME)); if (note) await onMoveNote(note, folderId); };
  const closeMenuThen = (event: MouseEvent<HTMLButtonElement>, callback: () => void) => { event.currentTarget.closest("details")?.removeAttribute("open"); callback(); };

  const NoteRow = ({ note, preview = false }: { note: Note; preview?: boolean }) => <article className={`files-layout-note ${preview ? "with-preview" : ""} ${selectedId === note.id ? "active" : ""}`} draggable onDragStart={(event) => dragStart(event, note)}><button className="files-layout-note-main" onClick={() => onOpenNote(note, false)} onDoubleClick={() => onOpenNote(note, true)}><FileText size={15} /><span><strong>{note.title || (vi ? "Chưa có tiêu đề" : "Untitled")}</strong>{preview && <small>{note.content.trim().slice(0, 68) || (vi ? "Ghi chú trống" : "Empty note")}</small>}</span></button><div className="files-layout-note-actions"><button className={note.is_favorite ? "is-favorite" : ""} title={vi ? "Yêu thích" : "Favorite"} onClick={() => onToggleFavorite(note)}><Star size={13} fill={note.is_favorite ? "currentColor" : "none"} /></button><button className="danger-text" title={vi ? "Chuyển vào Thùng rác" : "Move to Trash"} onClick={() => onTrashNote(note)}><Trash2 size={13} /></button></div></article>;

  const FolderNode = ({ folder, depth = 0 }: { folder: FolderRecord; depth?: number }): React.ReactNode => {
    const childFolders = (foldersByParent.get(folder.id) ?? []).filter(treeMatches);
    const childNotes = sortNotes(activeNotes.filter((note) => note.folder_id === folder.id && matchesNote(note)));
    const hasChildren = childFolders.length > 0 || childNotes.length > 0;
    const expanded = Boolean(queryText) || expandedFolders.has(folder.id);
    return <div className="files-layout-folder-node" style={{ "--files-layout-depth": depth } as React.CSSProperties} key={folder.id}><div className={`files-layout-folder-row ${activeView.type === "folder" && activeView.folderId === folder.id ? "active" : ""} ${dropTarget === folder.id ? "drop-target" : ""}`} onDragOver={(event) => dragOver(event, folder.id)} onDragLeave={() => setDropTarget(null)} onDrop={(event) => void drop(event, folder.id)}><button className="files-layout-disclosure" onClick={() => toggleFolder(folder.id)} aria-label={expanded ? (vi ? "Thu gọn thư mục" : "Collapse folder") : (vi ? "Mở rộng thư mục" : "Expand folder")}>{hasChildren ? expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span />}</button><button className="files-layout-folder-main" onClick={() => { onSelectFolder(folder.id); openFolder(folder.id); }}><Folder size={15} /><strong>{folder.name}</strong><small>{noteCount(folder.id)}</small></button><button className="files-layout-folder-add" title={vi ? "Tạo ghi chú trong thư mục" : "New note in folder"} onClick={() => onNewNote(folder.id)}><Plus size={13} /></button><details className="files-layout-folder-menu" data-overlay-root><summary aria-label={vi ? "Tác vụ thư mục" : "Folder actions"}><MoreHorizontal size={14} /></summary><div className="menu-popover"><button onClick={(event) => closeMenuThen(event, () => onNewNote(folder.id))}><Plus size={14} />{vi ? "Ghi chú mới" : "New note"}</button><button onClick={(event) => closeMenuThen(event, () => onNewFolder(folder.id))}><FolderOpen size={14} />{vi ? "Thư mục con" : "New subfolder"}</button><button onClick={(event) => closeMenuThen(event, () => onRenameFolder(folder))}><Pencil size={14} />{vi ? "Đổi tên" : "Rename"}</button><button className="danger-text" onClick={(event) => closeMenuThen(event, () => onTrashFolder(folder))}><Trash2 size={14} />{vi ? "Xóa thư mục" : "Delete folder"}</button></div></details></div>{expanded && <div className="files-layout-folder-children">{childFolders.map((child) => <FolderNode key={child.id} folder={child} depth={depth + 1} />)}{childNotes.map((note) => <NoteRow key={note.id} note={note} />)}{!hasChildren && <span className="files-layout-empty-inline">{vi ? "Thư mục trống" : "Folder is empty"}</span>}</div>}</div>;
  };
  const sectionHeader = (id: string, label: string, count?: number, action?: React.ReactNode) => <header className="files-layout-section-header"><button className="files-layout-section-toggle" onClick={() => toggleSection(id)}><span>{expandedSections.has(id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>{label}{count !== undefined && <small>{count}</small>}</button>{action}</header>;
  const roots = (foldersByParent.get(null) ?? []).filter(treeMatches);
  const showQuickAccess = !queryText;
  return <div className="file-explorer-content files-sidebar-layout">
    <header className="file-explorer-header"><div><span className="eyebrow">SECOND BRAIN</span><h2>{vi ? "Tệp" : "Files"}</h2></div><button className="icon-button small" onClick={onSettings} title={vi ? "Cài đặt" : "Settings"}><Settings2 size={16} /></button></header>
    <div className="files-layout-toolbar"><button className="files-layout-new-note" title={vi ? "Ghi chú mới" : "New note"} onClick={() => onNewNote(null)}><Plus size={16} /><span>{vi ? "Mới" : "New"}</span></button><button title={vi ? "Thư mục mới" : "New folder"} onClick={() => onNewFolder(null)}><FolderOpen size={16} /></button><details className="files-layout-sort" data-overlay-root><summary title={vi ? "Sắp xếp ghi chú" : "Sort notes"}><SortAsc size={16} /></summary><div className="menu-popover"><button className={noteSort === "updated" ? "active" : ""} onClick={(event) => closeMenuThen(event, () => setNoteSort("updated"))}>{vi ? "Mới cập nhật" : "Last updated"}</button><button className={noteSort === "title" ? "active" : ""} onClick={(event) => closeMenuThen(event, () => setNoteSort("title"))}>{vi ? "Tiêu đề A–Z" : "Title A–Z"}</button></div></details><button title={vi ? "Làm mới" : "Refresh"} onClick={onRefresh}><RefreshCw size={15} /></button></div>
    <div className="file-explorer-search"><Search size={15} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={vi ? "Tìm ghi chú hoặc thư mục..." : "Search notes or folders..."} />{query && <button onClick={() => onQueryChange("")}><X size={14} /></button>}</div>
    <div className="files-layout-scroll">
      {showQuickAccess && <section className="files-layout-section">{sectionHeader("recent", vi ? "Gần đây" : "Recent", recent.length)}{expandedSections.has("recent") && (recent.length ? <div className="files-layout-list">{recent.map((note) => <NoteRow key={note.id} note={note} preview />)}</div> : <div className="files-layout-empty"><FileText size={18} /><span>{vi ? "Chưa có ghi chú gần đây" : "No recent notes"}</span></div>)}</section>}
      {showQuickAccess && <section className="files-layout-section">{sectionHeader("inbox", vi ? "Không có thư mục" : "Unfiled", inbox.length, <button className="files-layout-header-action" title={vi ? "Ghi chú mới" : "New note"} onClick={() => onNewNote(null)}><Plus size={14} /></button>)}{expandedSections.has("inbox") && <div className={`files-layout-inbox ${dropTarget === "__unfiled__" ? "drop-target" : ""}`} onDragOver={(event) => dragOver(event, "__unfiled__")} onDragLeave={() => setDropTarget(null)} onDrop={(event) => void drop(event, null)}>{inbox.length ? inbox.map((note) => <NoteRow key={note.id} note={note} />) : <div className="files-layout-empty"><FileText size={18} /><span>{vi ? "Ghi chú mới sẽ xuất hiện ở đây" : "New notes appear here"}</span></div>}</div>}</section>}
      {showQuickAccess && <section className="files-layout-section">{sectionHeader("recent-folders", vi ? "Thư mục mới tạo" : "New folders", recentFolders.length)}{expandedSections.has("recent-folders") && (recentFolders.length ? <div className="files-layout-folder-shortcuts">{recentFolders.map((folder) => <button key={folder.id} onClick={() => { onSelectFolder(folder.id); openFolder(folder.id); }}><Folder size={14} /><span>{folder.name}</span><small>{noteCount(folder.id)}</small></button>)}</div> : <div className="files-layout-empty"><Folder size={18} /><span>{vi ? "Chưa có thư mục" : "No folders yet"}</span></div>)}</section>}
      <section className="files-layout-section files-layout-tree-section">{sectionHeader("folders", queryText ? (vi ? "Kết quả trong thư mục" : "Folder results") : (vi ? "Thư mục của bạn" : "Your folders"), roots.length, <button className="files-layout-header-action" title={vi ? "Thư mục mới" : "New folder"} onClick={() => onNewFolder(null)}><Plus size={14} /></button>)}{expandedSections.has("folders") && (roots.length ? <div className="files-layout-tree">{roots.map((folder) => <FolderNode key={folder.id} folder={folder} />)}</div> : <div className="files-layout-empty"><Folder size={18} /><span>{queryText ? (vi ? "Không tìm thấy thư mục hoặc ghi chú" : "No folders or notes found") : (vi ? "Tạo thư mục để phân loại ghi chú" : "Create a folder to organize notes")}</span></div>)}</section>
    </div>
  </div>;
}
