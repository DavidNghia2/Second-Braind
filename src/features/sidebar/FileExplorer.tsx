import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Settings2, SortAsc, Star, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { Folder as FolderType, Note } from "../notes/types";

export type SidebarView =
  | { type: "all" }
  | { type: "favorites" }
  | { type: "trash" }
  | { type: "folder"; folderId: string }
  | { type: "unfiled" };

const NOTE_MIME = "application/x-secondbrain-note";
const sortNotes = (notes: Note[], newest: boolean) => [...notes].sort((left, right) => newest ? right.updated_at.localeCompare(left.updated_at) : (left.title || "").localeCompare(right.title || ""));

export function FileExplorer({ language, notes, folders, selectedId, activeView, query, onQueryChange, onNewNote, onNewFolder, onSelectView, onOpenNote, onRenameNote, onMoveNote, onUpdateNote, onTrashNote, onRenameFolder, onTrashFolder, onRefresh, onSettings }: {
  language: "vi" | "en";
  notes: Note[];
  folders: FolderType[];
  selectedId: string | null;
  activeView: SidebarView;
  query: string;
  onQueryChange: (value: string) => void;
  onNewNote: (folderId?: string | null) => void;
  onNewFolder: (parentId?: string | null) => void;
  onSelectView: (view: SidebarView) => void;
  onOpenNote: (note: Note, pinned: boolean) => void;
  onRenameNote: (note: Note) => void;
  onMoveNote: (note: Note, folderId: string | null) => Promise<void>;
  onUpdateNote: (note: Note, patch: Partial<Pick<Note, "is_favorite" | "is_pinned">>) => void;
  onTrashNote: (note: Note) => void;
  onRenameFolder: (folder: FolderType) => void;
  onTrashFolder: (folder: FolderType) => void;
  onRefresh: () => void;
  onSettings: () => void;
}) {
  const vi = language === "vi";
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sortNewest, setSortNewest] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [noteMenu, setNoteMenu] = useState<{ noteId: string; top: number; left: number } | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ folderId: string; top: number; left: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const activeNotes = useMemo(() => notes.filter((note) => !note.deleted_at), [notes]);
  const activeFolders = useMemo(() => folders.filter((folder) => !folder.deleted_at), [folders]);
  const queryValue = query.trim().toLocaleLowerCase(vi ? "vi-VN" : "en-US");
  const matches = (note: Note) => !queryValue || `${note.title} ${note.content}`.toLocaleLowerCase(vi ? "vi-VN" : "en-US").includes(queryValue);
  const allNotes = activeNotes.filter(matches);
  const favorites = activeNotes.filter((note) => Boolean(note.is_favorite) && matches(note));
  const unfiled = activeNotes.filter((note) => note.folder_id === null && matches(note));

  const foldersByParent = useMemo(() => {
    const result = new Map<string | null, FolderType[]>();
    for (const folder of activeFolders) result.set(folder.parent_id, [...(result.get(folder.parent_id) ?? []), folder]);
    result.forEach((items) => items.sort((a, b) => a.name.localeCompare(b.name, vi ? "vi-VN" : "en-US")));
    return result;
  }, [activeFolders, vi]);

  const descendantFolderIds = (id: string): string[] => [id, ...(foldersByParent.get(id) ?? []).flatMap((folder) => descendantFolderIds(folder.id))];
  const countFolder = (id: string) => activeNotes.filter((note) => descendantFolderIds(id).includes(note.folder_id ?? "")).length;

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!(event.target as Element | null)?.closest("[data-file-menu]")) { setNoteMenu(null); setFolderMenu(null); } };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { setNoteMenu(null); setFolderMenu(null); } };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", keydown); };
  }, []);

  const setMenu = (event: MouseEvent<HTMLElement>, kind: "note" | "folder", id: string) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const value = { [kind === "note" ? "noteId" : "folderId"]: id, top: Math.min(window.innerHeight - 330, rect.bottom + 4), left: Math.min(window.innerWidth - 210, Math.max(12, rect.right - 200)) } as never;
    if (kind === "note") setNoteMenu(value); else setFolderMenu(value);
  };
  const toggleFolder = (id: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const dragStart = (event: DragEvent<HTMLDivElement>, note: Note) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(NOTE_MIME, note.id); event.dataTransfer.setData("text/plain", note.title || "note"); };
  const dragOver = (event: DragEvent<HTMLElement>, target: string) => { if (!event.dataTransfer.types.includes(NOTE_MIME)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(target); };
  const drop = async (event: DragEvent<HTMLElement>, folderId: string | null) => { event.preventDefault(); setDropTarget(null); const id = event.dataTransfer.getData(NOTE_MIME); const note = activeNotes.find((item) => item.id === id); if (note) await onMoveNote(note, folderId); };

  const renderNote = (note: Note) => <div className={`file-note-row ${selectedId === note.id ? "active" : ""}`} key={note.id} draggable onDragStart={(event) => dragStart(event, note)} onContextMenu={(event) => setMenu(event, "note", note.id)}>
    <button className="file-note-main" onClick={() => onOpenNote(note, false)} onDoubleClick={() => onOpenNote(note, true)} title={note.title || (vi ? "Chưa có tiêu đề" : "Untitled")}><FileText size={15} /><span>{note.title || (vi ? "Chưa có tiêu đề" : "Untitled")}</span></button>
    <button className="file-note-menu-trigger" title={vi ? "Thao tác ghi chú" : "Note actions"} aria-label={vi ? "Thao tác ghi chú" : "Note actions"} onClick={(event) => setMenu(event, "note", note.id)}><MoreHorizontal size={14} /></button>
  </div>;

  const renderFolder = (folder: FolderType, depth = 0): React.ReactNode => {
    const children = foldersByParent.get(folder.id) ?? [];
    const isCollapsed = collapsed.has(folder.id);
    const directNotes = sortNotes(activeNotes.filter((note) => note.folder_id === folder.id && matches(note)), sortNewest);
    const hasVisibleChildren = children.length > 0 || directNotes.length > 0;
    const isActive = activeView.type === "folder" && activeView.folderId === folder.id;
    return <div className="file-tree-group" key={folder.id} style={{ "--tree-depth": depth } as React.CSSProperties}><div className={`file-tree-heading ${isActive ? "active" : ""} ${dropTarget === folder.id ? "drop-target" : ""}`} onDragOver={(event) => dragOver(event, folder.id)} onDragLeave={() => setDropTarget(null)} onDrop={(event) => void drop(event, folder.id)} onContextMenu={(event) => setMenu(event, "folder", folder.id)}><button className="file-tree-toggle" onClick={() => toggleFolder(folder.id)}>{hasVisibleChildren && (isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}</button><button className="file-tree-folder-name" onClick={() => onSelectView({ type: "folder", folderId: folder.id })}><Folder size={15} /><strong>{folder.name}</strong><small>{countFolder(folder.id)}</small></button><button className="file-tree-add" onClick={() => onNewNote(folder.id)}><Plus size={13} /></button><button className="file-tree-more" onClick={(event) => setMenu(event, "folder", folder.id)}><MoreHorizontal size={14} /></button></div>{!isCollapsed && <div className="file-tree-children">{directNotes.map((note) => renderNote(note))}{children.map((child) => renderFolder(child, depth + 1))}</div>}</div>;
  };

  const renderVirtual = (kind: "all" | "favorites", label: string, Icon: typeof FolderOpen, list: Note[]) => <><button className={`file-root-row ${activeView.type === kind ? "active" : ""}`} onClick={() => onSelectView({ type: kind })}><Icon size={15} /><span>{label}</span><small>{list.length}</small></button>{activeView.type === kind && <div className="file-tree-children">{sortNotes(list, sortNewest).map((note) => renderNote(note))}{!list.length && <span className="file-tree-empty">{vi ? "Trống" : "Empty"}</span>}</div>}</>;
  const activeMenuNote = noteMenu ? activeNotes.find((note) => note.id === noteMenu.noteId) : null;
  const activeMenuFolder = folderMenu ? activeFolders.find((folder) => folder.id === folderMenu.folderId) : null;

  return <><div className="file-explorer-content">
    <header className="file-explorer-header"><div><span className="eyebrow">SECOND BRAIN</span><h2>{vi ? "Tệp" : "Files"}</h2></div><button className="icon-button small" onClick={onSettings} title={vi ? "Cài đặt" : "Settings"}><Settings2 size={16} /></button></header>
    <div className="file-explorer-toolbar"><button title={vi ? "Ghi chú mới" : "New note"} onClick={() => onNewNote(null)}><Plus size={16} /></button><button title={vi ? "Thư mục mới" : "New folder"} onClick={() => onNewFolder(null)}><FolderOpen size={16} /></button><button title={vi ? "Sắp xếp" : "Sort"} onClick={() => setSortNewest((value) => !value)}><SortAsc size={16} /></button><button title={vi ? "Thu gọn tất cả" : "Collapse all"} onClick={() => setCollapsed(new Set(activeFolders.map((folder) => folder.id)))}><ChevronRight size={16} /></button><div className="file-explorer-more"><button title={vi ? "Thêm" : "More"} onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal size={16} /></button>{moreOpen && <div className="menu-popover"><button onClick={onRefresh}><RefreshCw size={14} />{vi ? "Làm mới" : "Refresh"}</button><button onClick={() => setMoreOpen(false)}><X size={14} />{vi ? "Đóng menu" : "Close menu"}</button></div>}</div></div>
    <div className="file-explorer-search"><Search size={15} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={vi ? "Tìm tệp..." : "Search files..."} />{query && <button onClick={() => onQueryChange("")}><X size={14} /></button>}</div>
    <div className="file-explorer-tree">{renderVirtual("all", vi ? "Tất cả ghi chú" : "All Notes", FolderOpen, allNotes)}{renderVirtual("favorites", vi ? "Yêu thích" : "Favorites", Star, favorites)}<div className="file-tree-section-label">{vi ? "Thư mục" : "Folders"}</div>{(foldersByParent.get(null) ?? []).map((folder) => renderFolder(folder))}<div className={`file-tree-heading unfiled virtual-root ${activeView.type === "unfiled" ? "active" : ""} ${dropTarget === "__unfiled__" ? "drop-target" : ""}`} onDragOver={(event) => dragOver(event, "__unfiled__")} onDragLeave={() => setDropTarget(null)} onDrop={(event) => void drop(event, null)}><button className="file-tree-toggle" onClick={() => toggleFolder("__unfiled__")}>{collapsed.has("__unfiled__") ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button><button className="file-tree-folder-name" onClick={() => onSelectView({ type: "unfiled" })}><FolderOpen size={15} /><strong>{vi ? "Không có thư mục" : "Unfiled"}</strong><small>{unfiled.length}</small></button><button className="file-tree-add" onClick={() => onNewNote(null)}><Plus size={13} /></button></div>{!collapsed.has("__unfiled__") && <div className="file-tree-children">{sortNotes(unfiled, sortNewest).map((note) => renderNote(note))}</div>}</div>
  </div>
  {activeMenuNote && noteMenu && createPortal(<div className="file-note-context menu-popover" data-file-menu style={{ position: "fixed", top: Math.max(12, noteMenu.top), left: noteMenu.left, right: "auto" }}><button onClick={() => { onRenameNote(activeMenuNote); setNoteMenu(null); }}><Pencil size={14} />{vi ? "Đổi tên" : "Rename"}</button><div className="file-move-menu"><span><FolderOpen size={14} />{vi ? "Di chuyển đến thư mục" : "Move to folder"}</span><button onClick={() => { void onMoveNote(activeMenuNote, null); setNoteMenu(null); }}>{vi ? "Không có thư mục" : "Unfiled"}</button>{activeFolders.map((folder) => <button key={folder.id} onClick={() => { void onMoveNote(activeMenuNote, folder.id); setNoteMenu(null); }}>{folder.name}</button>)}</div><button onClick={() => { onUpdateNote(activeMenuNote, { is_favorite: activeMenuNote.is_favorite ? 0 : 1 }); setNoteMenu(null); }}><Star size={14} fill={activeMenuNote.is_favorite ? "currentColor" : "none"} />{vi ? "Yêu thích" : "Favorite"}</button><button className="danger-text" onClick={() => { onTrashNote(activeMenuNote); setNoteMenu(null); }}><Trash2 size={14} />{vi ? "Xóa" : "Delete"}</button></div>, document.body)}
  {activeMenuFolder && folderMenu && createPortal(<div className="file-note-context menu-popover" data-file-menu style={{ position: "fixed", top: Math.max(12, folderMenu.top), left: folderMenu.left, right: "auto" }}><button onClick={() => { onNewNote(activeMenuFolder.id); setFolderMenu(null); }}><Plus size={14} />{vi ? "Tạo ghi chú" : "New note"}</button><button onClick={() => { onNewFolder(activeMenuFolder.id); setFolderMenu(null); }}><FolderOpen size={14} />{vi ? "Tạo thư mục con" : "New subfolder"}</button><button onClick={() => { onRenameFolder(activeMenuFolder); setFolderMenu(null); }}><Pencil size={14} />{vi ? "Đổi tên" : "Rename"}</button><button className="danger-text" onClick={() => { onTrashFolder(activeMenuFolder); setFolderMenu(null); }}><Trash2 size={14} />{vi ? "Xóa" : "Delete"}</button></div>, document.body)}
  </>;
}
