import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type ReactNode } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { dropPoint } from "@tiptap/pm/transform";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy as CopyIcon,
  DatabaseBackup,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Info,
  Link2,
  Monitor,
  Moon,
  MoreHorizontal,
  NotebookTabs,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Star,
  Sun,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AttachmentsPanel } from "./features/notes/AttachmentsPanel";
import { closeDatabase } from "./features/notes/database";
import { RichTextEditor } from "./features/editor/RichTextEditor";
import { CompactRichTextToolbar } from "./features/editor/CompactRichTextToolbar";
import { hasAttachmentDrag, readAttachmentDrag } from "./features/editor/attachmentDrag";
import { overlayStore, useActiveOverlay } from "./features/editor/overlayStore";
import { documentSearchText } from "./features/editor/document";
import { noteService } from "./features/notes/noteService";
import { storageService } from "./features/notes/storageService";
import { useNotesStore } from "./features/notes/useNotesStore";
import type { Attachment, EditorSettings, Folder as FolderRecord, LinkPreview } from "./features/notes/types";
import type { Note, NotePatch } from "./features/notes/types";
import { Ribbon } from "./features/sidebar/Ribbon";
import { FlatNotesSidebar } from "./features/sidebar/FlatNotesSidebar";
import { FilesSidebarLayout } from "./features/sidebar/FilesSidebarLayout";
import { SidebarViewPanel } from "./features/sidebar/SidebarViewPanel";
import type { SidebarView as NoteSidebarView } from "./features/sidebar/FileExplorer";
import { EmptyTab } from "./features/workspace/EmptyTab";
import { NoteInspector } from "./features/inspector/NoteInspector";
import { WorkspaceShell } from "./features/workspace/WorkspaceShell";
import { WorkspaceTabs } from "./features/workspace/WorkspaceTabs";
import { useWorkspaceStore, workspaceStore, type SidebarView as WorkspaceSidebarView, type WorkspaceTab } from "./features/workspace/workspaceStore";
import { TrashMain, TrashSidebar, type TrashSort } from "./features/trash/TrashView";
import { deletedFolderRoots, notesInFolderTree, resolveTrashSelection, sortDeleted, trashItemKey } from "./features/trash/trashModel";
import "./App.css";

type View = "all" | "favorites" | "trash" | "folder" | "unfiled";
type Language = "vi" | "en";
type EditorMode = "edit" | "preview";
type Theme = "dark" | "light" | "system";

const defaultEditorSettings: EditorSettings = { fontFamily: "system", fontSize: 16, lineHeight: 1.7, contentWidth: 780 };
const editorFonts: Record<string, string> = {
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  inter: "Inter, system-ui, sans-serif",
  segoe: "'Segoe UI', system-ui, sans-serif",
  arial: "Arial, sans-serif",
  ibm: "'IBM Plex Sans', system-ui, sans-serif",
  source: "'Source Sans 3', system-ui, sans-serif",
  lora: "Lora, Georgia, serif",
  merriweather: "Merriweather, Georgia, serif",
  jetbrains: "'JetBrains Mono', Consolas, monospace",
  fira: "'Fira Code', Consolas, monospace",
};

const copy = {
  vi: {
    all: "Tất cả ghi chú", favorites: "Yêu thích", trash: "Thùng rác", folders: "Thư mục",
    newNote: "Ghi chú mới", search: "Tìm kiếm ghi chú...", untitled: "Chưa có tiêu đề",
    start: "Bắt đầu viết Markdown...", saved: "Đã lưu", saving: "Đang lưu...", editing: "Đang chỉnh sửa",
    failed: "Lưu thất bại", retry: "Thử lại", restore: "Khôi phục", delete: "Xóa", favorite: "Yêu thích", pin: "Ghim",
    noSelection: "Chọn một ghi chú để xem và chỉnh sửa nội dung", welcome: "Không gian của bạn đã sẵn sàng",
    edit: "Soạn thảo", preview: "Xem trước", updated: "Cập nhật", newFolder: "Thư mục mới",
    noFolder: "Không có thư mục", moveTo: "Chuyển vào thư mục", settings: "Cài đặt",
    empty: "Chưa có ghi chú", emptyHint: "Tạo ghi chú đầu tiên để bắt đầu xây dựng bộ não thứ hai.",
    noResults: "Không tìm thấy ghi chú", noResultsHint: "Thử một từ khóa khác hoặc xóa bộ lọc tìm kiếm.",
    noFavorites: "Chưa có ghi chú yêu thích", noFavoritesHint: "Đánh dấu sao để giữ những ghi chú quan trọng ở đây.",
    emptyTrash: "Thùng rác đang trống", emptyTrashHint: "Ghi chú đã xóa sẽ xuất hiện ở đây để bạn có thể khôi phục.",
    results: "kết quả", permanentDelete: "Xóa vĩnh viễn", moveTrash: "Chuyển vào Thùng rác",
  },
  en: {
    all: "All notes", favorites: "Favorites", trash: "Trash", folders: "Folders",
    newNote: "New note", search: "Search notes...", untitled: "Untitled",
    start: "Start writing Markdown...", saved: "Saved", saving: "Saving...", editing: "Editing",
    failed: "Save failed", retry: "Retry", restore: "Restore", delete: "Delete", favorite: "Favorite", pin: "Pin",
    noSelection: "Select a note to view and edit its content", welcome: "Your workspace is ready",
    edit: "Edit", preview: "Preview", updated: "Updated", newFolder: "New folder",
    noFolder: "No folder", moveTo: "Move to folder", settings: "Settings",
    empty: "No notes yet", emptyHint: "Create your first note to start building your second brain.",
    noResults: "No notes found", noResultsHint: "Try another keyword or clear the search filter.",
    noFavorites: "No favorite notes", noFavoritesHint: "Star important notes to keep them here.",
    emptyTrash: "Trash is empty", emptyTrashHint: "Deleted notes will appear here so you can restore them.",
    results: "results", permanentDelete: "Delete permanently", moveTrash: "Move to Trash",
  },
} as const;

const previewText = (content: string, language: Language) =>
  content.replace(/[#>*_`[\]()~-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 118)
  || (language === "vi" ? "Chưa có nội dung" : "No content yet");

const relativeTime = (date: string, language: Language) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 1) return language === "vi" ? "Vừa xong" : "Just now";
  if (minutes < 60) return language === "vi" ? `${minutes} phút trước` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return language === "vi" ? `${hours} giờ trước` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return language === "vi" ? `${days} ngày trước` : `${days}d ago`;
  return new Date(date).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US", { month: "short", day: "numeric" });
};

function Modal({ title, description, children, onClose, className = "" }: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className={`modal-card ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="modal-header">
        <div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div>
        <button className="icon-button" title="Đóng" aria-label="Đóng" onClick={onClose}><X size={18} /></button>
      </header>
      {children}
    </section>
  </div>;
}

function App() {
  const store = useNotesStore();
  const workspace = useWorkspaceStore();
  const [sidebarView, setSidebarView] = useState<NoteSidebarView>({ type: "all" });
  const view: View = sidebarView.type;
  const folderId = sidebarView.type === "folder" ? sidebarView.folderId : null;
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("language") as Language) || "vi");
  const [theme, setTheme] = useState<Theme>(() => { const value = localStorage.getItem("theme"); return value === "dark" || value === "light" || value === "system" ? value : "system"; });
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backups, setBackups] = useState<string[]>([]);
  const [storageStatus, setStorageStatus] = useState<Awaited<ReturnType<typeof storageService.getStatus>>>(null);
  const [importMode, setImportMode] = useState<"managed" | "linked">("managed");
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(defaultEditorSettings);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [linkPreviews, setLinkPreviews] = useState<LinkPreview[]>([]);
  const [pendingLink, setPendingLink] = useState<{ url: string } | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [richEditor, setRichEditor] = useState<Editor | null>(null);
  const activeOverlay = useActiveOverlay();
  const [notice, setNotice] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ mode: "create" | "rename"; id?: string; parentId?: string | null; name: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; description: string; confirm: string; action: () => Promise<void>; pending?: boolean; error?: string } | null>(null);
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [trashQuery, setTrashQuery] = useState("");
  const [trashSort, setTrashSort] = useState<TrashSort>("deleted-desc");
  const [trashSelectedId, setTrashSelectedId] = useState<string | null>(null);
  const [trashSelectedFolderId, setTrashSelectedFolderId] = useState<string | null>(null);
  const [trashCheckedIds, setTrashCheckedIds] = useState<Set<string>>(() => new Set());
  const titleRef = useRef<HTMLInputElement>(null);
  const inspectorToggleRef = useRef<HTMLButtonElement>(null);
  const workspaceInitializedRef = useRef(false);
  const t = copy[language];
  const dark = theme === "dark" || (theme === "system" && systemDark);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? null : current), 3200);
  };

  useEffect(() => { localStorage.setItem("language", language); document.documentElement.lang = language; }, [language]);
  useEffect(() => {
    const closeNativeMenus = () => document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => menu.removeAttribute("open"));
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest("[data-overlay-root], .link-choice-popover")) { overlayStore.set(null); setPendingLink(null); closeNativeMenus(); }
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { overlayStore.set(null); setPendingLink(null); closeNativeMenus(); } };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown, true); document.removeEventListener("keydown", onKeyDown); };
  }, []);
  useEffect(() => { overlayStore.set(null); setPendingLink(null); }, [store.selectedId, editorMode]);
  useEffect(() => {
    if (workspace.focusMode) {
      setMetadataExpanded(false);
      overlayStore.set(null);
    }
  }, [workspace.focusMode]);
  useEffect(() => {
    if (activeOverlay) document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => menu.removeAttribute("open"));
  }, [activeOverlay]);
  useEffect(() => { localStorage.setItem("theme", theme); }, [theme]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    void Promise.all([storageService.getStatus(), storageService.getImportMode(), storageService.getEditorSettings()])
      .then(([status, mode, settings]) => {
        setStorageStatus(status);
        setImportMode(mode);
        setEditorSettings(settings);
        if (!status || !status.accessible) setSettingsOpen(true);
      })
      .catch((cause: unknown) => store.setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  useEffect(() => {
    if (!store.ready) return;
    void workspaceStore.hydrate(new Set(store.notes.map((note) => note.id)));
  }, [store.ready]);

  useEffect(() => {
    if (!store.ready || !workspace.hydrated || workspaceInitializedRef.current) return;
    workspaceInitializedRef.current = true;
    const activeTab = workspace.tabs.find((tab) => tab.id === workspace.activeTabId);
    void store.selectNote(activeTab?.noteId ?? null);
  }, [store.ready, workspace.hydrated, workspace.tabs, workspace.activeTabId]);

  useEffect(() => {
    if (!workspace.hydrated) return;
    for (const tab of workspace.tabs) {
      if (!tab.noteId) continue;
      const note = store.notes.find((item) => item.id === tab.noteId);
      const title = note?.title || t.untitled;
      if (note && tab.title !== title) workspaceStore.renameTab(tab.id, title);
    }
  }, [store.notes, workspace.hydrated, workspace.tabs, t.untitled]);

  useEffect(() => {
    const noteId = store.selectedId;
    setAttachments([]);
    setLinkPreviews([]);
    if (!noteId) {
      return;
    }
    void Promise.all([noteService.listAttachments(noteId), noteService.listLinkPreviews(noteId)])
      .then(([items, links]) => {
        setAttachments(items);
        setLinkPreviews(links);
        if (!items.length && workspaceStore.get().inspectorOpen) workspaceStore.setInspectorOpen(false);
      })
      .catch((cause: unknown) => store.setError(cause instanceof Error ? cause.message : String(cause)));
  }, [store.selectedId]);

  const visibleNotes = useMemo(() => {
    const normalized = debouncedQuery.toLocaleLowerCase(language === "vi" ? "vi-VN" : "en-US");
    return store.notes.filter((note) => {
      const active = !note.deleted_at;
      const matchesView = view === "trash" ? !active
        : view === "favorites" ? active && Boolean(note.is_favorite)
        : view === "folder" ? active && note.folder_id === folderId
        : view === "unfiled" ? active && note.folder_id === null
        : active;
      return matchesView && (!normalized || `${note.title} ${note.content}`.toLocaleLowerCase().includes(normalized));
    }).sort((left, right) => (right.is_pinned - left.is_pinned) || right.updated_at.localeCompare(left.updated_at));
  }, [debouncedQuery, folderId, language, store.notes, view]);

  const trashNotes = useMemo(() => store.notes.filter((note) => Boolean(note.deleted_at)), [store.notes]);
  const trashFolders = useMemo(() => store.folders.filter((folder) => Boolean(folder.deleted_at)), [store.folders]);
  const visibleTrashNotes = useMemo(() => {
    const normalized = trashQuery.trim().toLocaleLowerCase(language === "vi" ? "vi-VN" : "en-US");
    return sortDeleted(
      trashNotes.filter((note) => !normalized || `${note.title} ${note.content}`.toLocaleLowerCase(language === "vi" ? "vi-VN" : "en-US").includes(normalized)),
      trashSort,
      (note) => note.title || "",
    );
  }, [language, trashNotes, trashQuery, trashSort]);
  const selectedTrashFolder = useMemo(() => trashFolders.find((folder) => folder.id === trashSelectedFolderId) ?? null, [trashFolders, trashSelectedFolderId]);
  const selectedTrashNote = useMemo(() => selectedTrashFolder ? null : visibleTrashNotes.find((note) => note.id === trashSelectedId) ?? visibleTrashNotes[0] ?? null, [selectedTrashFolder, trashSelectedId, visibleTrashNotes]);
  const trashItemKeys = useMemo(() => new Set([...trashNotes.map((note) => trashItemKey("note", note.id)), ...trashFolders.map((folder) => trashItemKey("folder", folder.id))]), [trashFolders, trashNotes]);
  const checkedTrashIds = useMemo(() => new Set([...trashCheckedIds].filter((key) => trashItemKeys.has(key))), [trashCheckedIds, trashItemKeys]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      return true;
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      store.setError(message);
      void noteService.logError(`ui: ${message}`);
      return false;
    }
  };

  const confirmAction = async () => {
    if (!confirmDialog || confirmDialog.pending) return;
    const dialog = confirmDialog;
    setConfirmDialog({ ...dialog, pending: true, error: undefined });
    try {
      await dialog.action();
      setConfirmDialog(null);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      store.setError(message);
      void noteService.logError(`ui: ${message}`);
      setConfirmDialog({ ...dialog, error: message });
    }
  };

  const runAttachmentImport = async (action: () => Promise<unknown>) => {
    setAttachmentBusy(true);
    try {
      await run(action);
    } finally {
      setAttachmentBusy(false);
    }
  };

  const flushForWorkspace = async (noteId: string | null) => {
    if (!noteId) return true;
    return store.flush(noteId);
  };

  const openTrashView = async () => {
    if (workspace.activeSidebarView === "trash") {
      if (store.selected && !store.selected.deleted_at) await store.selectNote(null);
      return;
    }
    if (!await flushForWorkspace(store.selectedId)) return;
    overlayStore.set(null);
    setPendingLink(null);
    setEditorMode("edit");
    workspaceStore.setSidebarView("trash");
    if (!store.selected?.deleted_at) await store.selectNote(null);
    const nextNoteId = trashSelectedId && trashNotes.some((note) => note.id === trashSelectedId) ? trashSelectedId : visibleTrashNotes[0]?.id ?? null;
    setTrashSelectedId(nextNoteId);
    setTrashSelectedFolderId(nextNoteId ? null : deletedFolderRoots(trashFolders)[0]?.id ?? null);
  };

  const openWorkspaceNote = async (note: Note, pinned: boolean) => {
    const previous = store.selectedId;
    if (previous && previous !== note.id && !await flushForWorkspace(previous)) return;
    if (note.deleted_at) {
      await openTrashView();
      setTrashSelectedId(note.id);
      return;
    }
    if (workspace.activeSidebarView === "trash") {
      workspaceStore.setSidebarView("files");
      setSidebarView({ type: "all" });
      setTrashSelectedFolderId(null);
    }
    workspaceStore.openNote(note.id, note.title || t.untitled, { pinned, preview: !pinned });
    await store.selectNote(note.id);
  };

  const selectWorkspaceTab = async (tab: WorkspaceTab) => {
    if (tab.id === workspace.activeTabId) return;
    const previous = store.selectedId;
    if (previous && previous !== tab.noteId && !await flushForWorkspace(previous)) return;
    workspaceStore.selectTab(tab.id);
    if (workspace.activeSidebarView === "trash") {
      workspaceStore.setSidebarView("files");
      setSidebarView({ type: "all" });
    }
    await store.selectNote(tab.noteId);
  };

  const closeWorkspaceTab = async (tab: WorkspaceTab) => {
    if (tab.noteId && !await flushForWorkspace(tab.noteId)) return;
    const wasActive = workspace.activeTabId === tab.id;
    const next = workspaceStore.closeTab(tab.id);
    if (wasActive) await store.selectNote(next?.noteId ?? null);
  };

  const createNote = async (folderId: string | null = null) => {
    await run(async () => {
      const note = await store.create(folderId);
      workspaceStore.rememberRecent(note.id);
      workspaceStore.openNote(note.id, note.title || t.untitled, { pinned: true, preview: false });
      if (view === "folder" || view === "trash") setSidebarView({ type: "all" });
      setQuery("");
      setEditorMode("edit");
      showNotice(language === "vi" ? "Đã tạo ghi chú mới" : "New note created");
      window.setTimeout(() => titleRef.current?.focus(), 50);
      return note;
    });
  };

  const chooseView = (next: View, nextFolder: string | null = null) => {
    if (next === "trash") {
      void openTrashView();
      return;
    }
    setSidebarView(next === "folder" && nextFolder ? { type: "folder", folderId: nextFolder } : next === "favorites" ? { type: "favorites" } : next === "all" ? { type: "all" } : { type: "unfiled" });
    setQuery("");
  };

  const renameNote = (note: Note) => {
    const next = window.prompt(language === "vi" ? "Tên ghi chú" : "Note title", note.title || t.untitled);
    if (next === null || !next.trim()) return;
    store.updateNote(note.id, { title: next.trim() });
    workspace.tabs.filter((tab) => tab.noteId === note.id).forEach((tab) => workspaceStore.renameTab(tab.id, next.trim()));
  };

  const moveNote = async (note: Note, folder: string | null) => { await store.moveNoteToFolder(note.id, folder); };
  void renameNote;
  void moveNote;
  const updateNote = (note: Note, patch: NotePatch) => store.updateNote(note.id, patch);
  const folderTreeNoteIds = (rootId: string) => {
    const folderIds = new Set<string>([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of store.folders) {
        if (folder.parent_id && folderIds.has(folder.parent_id) && !folderIds.has(folder.id)) {
          folderIds.add(folder.id);
          changed = true;
        }
      }
    }
    return store.notes.filter((note) => note.folder_id && folderIds.has(note.folder_id)).map((note) => note.id);
  };
  const leaveDeletedContent = async (noteIds: Iterable<string> = []) => {
    const deletedIds = new Set(noteIds);
    const before = workspaceStore.get();
    const activeTab = before.tabs.find((tab) => tab.id === before.activeTabId);
    const activeTabWasDeleted = Boolean(activeTab?.noteId && deletedIds.has(activeTab.noteId));
    before.tabs
      .filter((tab) => tab.noteId && deletedIds.has(tab.noteId))
      .forEach((tab) => workspaceStore.closeTab(tab.id));
    if (workspace.activeSidebarView === "trash") {
      setTrashSelectedId(null);
      setTrashSelectedFolderId(null);
      setTrashCheckedIds(new Set());
    }
    if (activeTabWasDeleted) {
      const currentWorkspace = workspaceStore.get();
      const activeTab = currentWorkspace.tabs.find((tab) => tab.id === currentWorkspace.activeTabId);
      await store.selectNote(activeTab?.noteId ?? null);
    }
  };

  const requestTrashNote = (note: Note) => setConfirmDialog({
    title: language === "vi" ? "Chuyển ghi chú vào Thùng rác?" : "Move note to Trash?",
    description: note.title || t.untitled,
    confirm: t.moveTrash,
    action: async () => {
      await store.removeFromTrash(note.id);
      await leaveDeletedContent([note.id]);
      showNotice(language === "vi" ? "Đã chuyển vào Thùng rác" : "Moved to Trash");
    },
  });

  const saveFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!folderDialog?.name.trim()) return;
    const succeeded = await run(async () => {
      if (!await store.flushAll()) throw new Error(t.failed);
      if (folderDialog.mode === "create") await noteService.createFolder(folderDialog.name, folderDialog.parentId ?? null);
      else await noteService.renameFolder(folderDialog.id!, folderDialog.name);
      await store.refresh();
    });
    if (succeeded) {
      showNotice(folderDialog.mode === "create"
        ? (language === "vi" ? "Đã tạo thư mục" : "Folder created")
        : (language === "vi" ? "Đã đổi tên thư mục" : "Folder renamed"));
      setFolderDialog(null);
    }
  };

  const requestDeleteFolder = (id: string, name: string) => {
    const noteIds = folderTreeNoteIds(id);
    const folderIds = new Set<string>([id]);
    let foundChild = true;
    while (foundChild) {
      foundChild = false;
      for (const folder of store.folders) {
        if (folder.parent_id && folderIds.has(folder.parent_id) && !folderIds.has(folder.id)) {
          folderIds.add(folder.id);
          foundChild = true;
        }
      }
    }
    setConfirmDialog({
    title: language === "vi" ? `Xóa thư mục “${name}”?` : `Delete “${name}”?`,
    description: language === "vi" ? "Toàn bộ thư mục con và ghi chú liên quan sẽ được chuyển vào Thùng rác; bạn có thể khôi phục lại sau." : "This folder tree and its notes will move to Trash and can be restored later.",
    confirm: language === "vi" ? "Xóa thư mục" : "Delete folder",
    action: async () => {
      if (!await store.flushAll()) throw new Error(t.failed);
      await store.removeFolderTree(id);
      if (sidebarView.type === "folder" && folderIds.has(sidebarView.folderId)) setSidebarView({ type: "all" });
      await leaveDeletedContent(noteIds);
      showNotice(language === "vi" ? "Đã chuyển thư mục vào Thùng rác" : "Folder moved to Trash");
    },
  });
  };

  const openSettings = async () => {
    await run(async () => {
      const [status, mode, settings] = await Promise.all([storageService.getStatus(), storageService.getImportMode(), storageService.getEditorSettings()]);
      setStorageStatus(status);
      setImportMode(mode);
      setEditorSettings(settings);
      setBackups(await noteService.listBackups(status?.root));
      setSettingsOpen(true);
    });
  };

  const chooseStorage = async () => {
    await run(async () => {
      const status = await storageService.chooseRoot();
      if (!status) return;
      setStorageStatus(status);
      setBackups(await noteService.listBackups(status.root));
      showNotice(language === "vi" ? "Đã chọn Workspace" : "Workspace selected");
    });
  };

  const changeImportMode = async (mode: "managed" | "linked") => {
    await run(async () => {
      await storageService.setImportMode(mode);
      setImportMode(mode);
    });
  };

  const createBackup = async () => {
    await run(async () => {
      if (!await store.flushAll()) throw new Error(t.failed);
      const name = await noteService.createBackup(storageStatus?.root);
      setBackups(await noteService.listBackups(storageStatus?.root));
      showNotice(language === "vi" ? `Đã tạo bản sao lưu ${name}` : `Backup ${name} created`);
    });
  };

  const requestRestoreBackup = (name: string) => setConfirmDialog({
    title: language === "vi" ? "Khôi phục dữ liệu?" : "Restore data?",
    description: language === "vi" ? `Khôi phục từ “${name}”. Dữ liệu hiện tại sẽ được sao lưu tự động trước khi thay thế và ứng dụng sẽ khởi động lại.` : `Restore “${name}”. Current data will be backed up before replacement and the app will restart.`,
    confirm: language === "vi" ? "Khôi phục" : "Restore",
    action: async () => {
      if (!await store.flushAll()) throw new Error(t.failed);
      await closeDatabase();
      await noteService.restoreBackup(name, storageStatus?.root);
    },
  });

  const moveSelectedToTrash = () => {
    const note = store.selected;
    if (!note) return;
    setConfirmDialog({
      title: language === "vi" ? "Chuyển ghi chú vào Thùng rác?" : "Move note to Trash?",
      description: language === "vi" ? `“${note.title || t.untitled}” có thể được khôi phục sau.` : `“${note.title || t.untitled}” can be restored later.`,
        confirm: t.moveTrash,
        action: async () => {
          await store.removeFromTrash(note.id);
          await leaveDeletedContent([note.id]);
          showNotice(language === "vi" ? "Đã chuyển vào Thùng rác" : "Moved to Trash");
        },
    });
  };

  const restoreNote = async (id: string) => {
    try {
      const note = await store.restore(id);
      if (note) {
        setSidebarView({ type: "all" });
        showNotice(language === "vi" ? "Đã khôi phục ghi chú" : "Note restored");
      }
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      store.setError(message);
    }
  };

  const clearTrashSelection = () => setTrashCheckedIds(new Set());
  const toggleTrashCheck = (key: string) => setTrashCheckedIds((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const deleteTrashIds = async (ids: string[]) => {
    for (const id of ids) {
      await store.permanentlyDelete(id);
    }
    await leaveDeletedContent(ids);
    await store.refresh();
  };
  const restoreTrashItems = async (keys: Iterable<string>) => {
    const selected = resolveTrashSelection(keys, trashNotes, trashFolders, "restore");
    for (const folder of selected.folders) await store.restoreFolderTree(folder.id);
    for (const note of selected.notes) await store.restore(note.id);
    clearTrashSelection();
    setTrashSelectedId(null);
    setTrashSelectedFolderId(null);
    await store.refresh();
  };
  const permanentlyDeleteTrashItems = async (keys: Iterable<string>) => {
    const selected = resolveTrashSelection(keys, trashNotes, trashFolders);
    const affectedNoteIds = new Set(selected.notes.map((note) => note.id));
    for (const folder of selected.folders) notesInFolderTree(folder.id, store.folders, trashNotes).forEach((note) => affectedNoteIds.add(note.id));
    for (const folder of selected.folders) await store.permanentlyDeleteFolderTree(folder.id);
    for (const note of selected.notes) await store.permanentlyDelete(note.id);
    await leaveDeletedContent(affectedNoteIds);
    clearTrashSelection();
    setTrashSelectedId(null);
    setTrashSelectedFolderId(null);
    await store.refresh();
  };
  const requestRestoreTrash = (note: Note) => {
    void run(async () => {
      await store.restore(note.id);
      setTrashCheckedIds((current) => {
        const next = new Set(current);
        next.delete(trashItemKey("note", note.id));
        return next;
      });
      if (trashSelectedId === note.id) setTrashSelectedId(null);
      showNotice(language === "vi" ? "Đã khôi phục ghi chú" : "Note restored");
    });
  };
  const requestDeleteTrash = (note: Note) => setConfirmDialog({
    title: t.permanentDelete,
    description: language === "vi" ? `“${note.title || t.untitled}” sẽ bị xóa vĩnh viễn.` : `“${note.title || t.untitled}” will be permanently deleted.`,
    confirm: t.permanentDelete,
    action: async () => {
      await deleteTrashIds([note.id]);
      showNotice(language === "vi" ? "Đã xóa vĩnh viễn" : "Permanently deleted");
    },
  });
  const requestRestoreTrashFolder = (folder: FolderRecord) => {
    void run(async () => {
      await store.restoreFolderTree(folder.id);
      setTrashCheckedIds((current) => { const next = new Set(current); next.delete(trashItemKey("folder", folder.id)); return next; });
      setTrashSelectedFolderId(null);
      showNotice(language === "vi" ? "Đã khôi phục thư mục" : "Folder restored");
    });
  };
  const requestDeleteTrashFolder = (folder: FolderRecord) => {
    const affectedNotes = notesInFolderTree(folder.id, store.folders, trashNotes);
    setConfirmDialog({
      title: language === "vi" ? `Xóa vĩnh viễn thư mục “${folder.name}”?` : `Permanently delete “${folder.name}”?`,
      description: language === "vi" ? `${affectedNotes.length} ghi chú bên trong sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.` : `${affectedNotes.length} contained notes will be permanently deleted. This cannot be undone.`,
      confirm: t.permanentDelete,
      action: async () => {
        await store.permanentlyDeleteFolderTree(folder.id);
        await leaveDeletedContent(affectedNotes.map((note) => note.id));
        setTrashSelectedFolderId(null);
        showNotice(language === "vi" ? "Đã xóa vĩnh viễn thư mục" : "Folder permanently deleted");
      },
    });
  };
  const restoreSelectedTrash = () => {
    void run(async () => {
      await restoreTrashItems([...checkedTrashIds]);
      showNotice(language === "vi" ? "Đã khôi phục các mục đã chọn" : "Selected items restored");
    });
  };
  const requestDeleteSelectedTrash = () => {
    if (!checkedTrashIds.size) return;
    setConfirmDialog({
      title: t.permanentDelete,
      description: language === "vi" ? `${checkedTrashIds.size} mục đã chọn sẽ bị xóa vĩnh viễn.` : `${checkedTrashIds.size} selected items will be permanently deleted.`,
      confirm: t.permanentDelete,
      action: async () => {
        await permanentlyDeleteTrashItems([...checkedTrashIds]);
        showNotice(language === "vi" ? "Đã xóa vĩnh viễn các mục đã chọn" : "Selected items permanently deleted");
      },
    });
  };
  const requestRestoreAllTrash = () => {
    if (!trashItemKeys.size) return;
    setConfirmDialog({
      title: language === "vi" ? "Khôi phục tất cả?" : "Restore all?",
      description: language === "vi" ? `Khôi phục ${trashItemKeys.size} mục trong Thùng rác.` : `Restore ${trashItemKeys.size} items from Trash.`,
      confirm: language === "vi" ? "Khôi phục tất cả" : "Restore all",
      action: async () => {
        await restoreTrashItems(trashItemKeys);
        showNotice(language === "vi" ? "Đã khôi phục tất cả" : "Restored all");
      },
    });
  };
  const requestEmptyTrash = () => {
    if (!trashItemKeys.size) return;
    setConfirmDialog({
      title: language === "vi" ? "Dọn sạch thùng rác?" : "Empty trash?",
      description: language === "vi" ? `${trashItemKeys.size} mục, gồm các ghi chú trong thư mục đã xóa, sẽ bị xóa vĩnh viễn.` : `${trashItemKeys.size} items, including notes in deleted folders, will be permanently deleted.`,
      confirm: language === "vi" ? "Dọn sạch" : "Empty trash",
      action: async () => {
        await permanentlyDeleteTrashItems(trashItemKeys);
        showNotice(language === "vi" ? "Đã dọn sạch thùng rác" : "Trash emptied");
      },
    });
  };

  const handleEditorReady = useCallback((editor: Editor | null) => setRichEditor(editor), []);

  const handleDocumentChange = (document: JSONContent) => {
    const note = store.selected;
    if (!note) return;
    store.updateSelected({
      content: documentSearchText(document),
      content_format: "richtext",
      content_json: JSON.stringify(document),
      legacy_markdown: note.content_format === "markdown" ? (note.legacy_markdown ?? note.content) : note.legacy_markdown,
    });
  };

  const isImage = (attachment: Attachment) => attachment.mime_type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(attachment.original_name);

  const rememberAttachment = (attachment: Attachment) => {
    setAttachments((current) => [...current.filter((item) => item.id !== attachment.id), attachment]);
  };

  const insertImportedAttachment = (attachment: Attachment) => {
    rememberAttachment(attachment);
    setEditorMode("edit");
    const node = isImage(attachment)
      ? { type: "managedImage", attrs: { attachmentId: attachment.id, width: 560, alignment: "center", caption: attachment.caption ?? "", alt: attachment.original_name } }
      : { type: "attachmentBlock", attrs: { attachmentId: attachment.id, displayMode: "card" } };
    richEditor?.chain().focus().insertContent(node).run();
  };

  const importPastedImage = async (file: File): Promise<Attachment | null> => {
    const note = store.selected;
    if (!note) return null;
    let imported: Attachment | null = null;
    await runAttachmentImport(async () => {
      imported = await storageService.importBytesForNote(note.id, file.name || `pasted-${Date.now()}.png`, file.type, new Uint8Array(await file.arrayBuffer()));
      if (imported) setAttachments((current) => [...current.filter((item) => item.id !== imported!.id), imported!]);
      showNotice(language === "vi" ? "Đã chèn ảnh từ clipboard" : "Image pasted");
    });
    return imported;
  };

  const chooseImage = async () => {
    const note = store.selected;
    if (!note) return;
    await runAttachmentImport(async () => {
      const attachment = await storageService.importForNote(note.id, "image");
      if (attachment) {
        insertImportedAttachment(attachment);
        showNotice(language === "vi" ? "Đã chèn hình ảnh" : "Image inserted");
      }
    });
  };

  const chooseAttachment = async () => {
    const note = store.selected;
    if (!note) return;
    await runAttachmentImport(async () => {
      const attachment = await storageService.importForNote(note.id, "attachment");
      if (attachment) {
        insertImportedAttachment(attachment);
        showNotice(language === "vi" ? "Đã đính kèm file" : "File attached");
      }
    });
  };

  const insertNormalLink = () => {
    if (!richEditor) return;
    const url = window.prompt(language === "vi" ? "URL liên kết" : "Link URL", "https://");
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (richEditor.state.selection.empty) richEditor.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } }] }).run();
    else richEditor.chain().focus().setLink({ href: url, target: "_blank", rel: "noopener noreferrer" }).run();
  };

  const classifyLink = (url: string): LinkPreview["provider"] => {
    try {
      const parsed = new URL(url);
      if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(parsed.hostname)) return "youtube";
      if (parsed.hostname === "github.com" || parsed.hostname === "www.github.com") return "github";
      if (parsed.pathname.split("/").filter(Boolean).length > 0) return "article";
    } catch {
      return "generic";
    }
    return "generic";
  };

  const chooseLinkDisplay = async (displayMode: "card" | "embed" | "link") => {
    const pending = pendingLink;
    const note = store.selected;
    if (!pending || !note) return;
    const provider = classifyLink(pending.url);
    if (displayMode === "link") {
      richEditor?.chain().focus().insertContent({ type: "text", text: pending.url, marks: [{ type: "link", attrs: { href: pending.url, target: "_blank", rel: "noopener noreferrer" } }] }).run();
      setPendingLink(null);
      overlayStore.set(null);
      return;
    }
    await run(async () => {
      const saved = await noteService.saveLinkPreview({
        id: crypto.randomUUID(), note_id: note.id, url: pending.url, provider,
        title: provider === "github" ? pending.url.replace(/^https?:\/\/github\.com\//, "") : null,
        description: null, image_url: null, site_name: null, display_mode: displayMode, metadata_json: null, fetched_at: null,
      });
      setLinkPreviews((current) => [...current.filter((item) => item.url !== saved.url), saved]);
      richEditor?.chain().focus().insertContent({ type: "smartLink", attrs: { url: pending.url, provider, displayMode, title: saved.title ?? "" } }).run();
      setPendingLink(null);
      overlayStore.set(null);
    });
  };

  const insertYoutube = () => {
    const url = window.prompt(language === "vi" ? "Dán URL YouTube" : "Paste a YouTube URL", "https://youtu.be/");
    if (!url || !/^https?:\/\//i.test(url)) return;
    overlayStore.set("link-choice");
    setPendingLink({ url });
  };

  const handleDroppedPath = async (path: string) => {
    const note = store.selected;
    if (!note) return;
    await runAttachmentImport(async () => {
      const attachment = await storageService.importPathForNote(note.id, path);
      insertImportedAttachment(attachment);
      showNotice(language === "vi" ? "Đã thêm file kéo thả" : "Dropped file added");
    });
  };

  const handleInspectorDroppedPath = async (path: string) => {
    const note = store.selected;
    if (!note) return;
    await runAttachmentImport(async () => {
      const attachment = await storageService.importPathForNote(note.id, path);
      rememberAttachment(attachment);
      showNotice(language === "vi" ? "Đã thêm file vào tệp đính kèm" : "File added to attachments");
    });
  };

  const attachmentNodeForDrop = (attachmentId: string, fallbackName: string, fallbackMime: string | null): ProseMirrorNode | null => {
    if (!richEditor) return null;
    const attachment = attachments.find((item) => item.id === attachmentId);
    const name = attachment?.original_name ?? fallbackName;
    const mime = attachment?.mime_type ?? fallbackMime ?? "";
    const image = mime.toLowerCase().startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
    const type = image ? richEditor.state.schema.nodes.managedImage : richEditor.state.schema.nodes.attachmentBlock;
    if (!type) return null;
    return type.create(image
      ? { attachmentId, width: 560, alignment: "center", caption: attachment?.caption ?? "", alt: name }
      : { attachmentId, displayMode: attachment?.display_mode ?? "card" });
  };

  const attachmentDropPosition = (event: DragEvent<HTMLDivElement>, node: ProseMirrorNode) => {
    if (!richEditor) return null;
    const slice = new Slice(Fragment.from(node), 0, 0);
    const coordinates = richEditor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    const documentEnd = richEditor.state.doc.content.size;
    const requestedPosition = coordinates?.pos ?? documentEnd;
    return dropPoint(richEditor.state.doc, requestedPosition, slice)
      ?? dropPoint(richEditor.state.doc, documentEnd, slice)
      ?? documentEnd;
  };

  const insertDroppedAttachment = (event: DragEvent<HTMLDivElement>) => {
    if (!richEditor || !hasAttachmentDrag(event.dataTransfer)) return false;
    const payload = readAttachmentDrag(event.dataTransfer);
    if (!payload?.attachmentId) return false;
    const node = attachmentNodeForDrop(payload.attachmentId, payload.originalName, payload.mimeType);
    if (!node) return false;
    const position = attachmentDropPosition(event, node);
    if (position === null) return false;
    richEditor.chain().focus().insertContentAt(position, node.toJSON()).run();
    return true;
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    if (hasAttachmentDrag(event.dataTransfer)) {
      if (insertDroppedAttachment(event)) {
        showNotice(language === "vi" ? "Đã chèn file vào ghi chú" : "Attachment inserted into the note");
      }
      return;
    }
    const files = Array.from(event.dataTransfer.files);
    for (const file of files) {
      const sourcePath = (file as File & { path?: string }).path;
      if (sourcePath) void handleDroppedPath(sourcePath);
      else if (file.type.startsWith("image/")) void runAttachmentImport(async () => insertImportedAttachment(await storageService.importBytesForNote(store.selected!.id, file.name, file.type, new Uint8Array(await file.arrayBuffer()))));
    }
  };

  const updateAttachment = async (attachment: Attachment, patch: Pick<Attachment, "display_mode" | "caption" | "width_mode">) => {
    await noteService.updateAttachment(attachment.id, patch);
    setAttachments((current) => current.map((item) => item.id === attachment.id ? { ...item, ...patch } : item));
  };

  const replaceAttachment = async (attachment: Attachment) => {
    const note = store.selected;
    if (!note || !isImage(attachment)) return;
    await runAttachmentImport(async () => {
      const replacement = await storageService.importForNote(note.id, "image");
      if (!replacement) return;
      let changed = false;
      if (richEditor) {
        const positions: number[] = [];
        richEditor.state.doc.descendants((node, position) => { if (node.type.name === "managedImage" && node.attrs.attachmentId === attachment.id) positions.push(position); });
        if (positions.length) {
          let transaction = richEditor.state.tr;
          for (const position of positions) {
            const node = richEditor.state.doc.nodeAt(position);
            if (node) transaction = transaction.setNodeMarkup(position, undefined, { ...node.attrs, attachmentId: replacement.id, alt: replacement.original_name, caption: replacement.caption ?? "" });
          }
          richEditor.view.dispatch(transaction);
          changed = true;
        }
      }
      if (!changed) { await storageService.unlink(note.id, replacement); return; }
      if (!await store.flush(note.id)) throw new Error(language === "vi" ? "Không thể lưu ghi chú trước khi thay ảnh" : "Could not save the note before replacing the image");
      await storageService.unlink(note.id, attachment);
      setAttachments((current) => [...current.filter((item) => item.id !== attachment.id), replacement]);
      showNotice(language === "vi" ? "Đã thay ảnh" : "Image replaced");
    });
  };

  const detachAttachment = async (attachment: Attachment) => {
    const note = store.selected;
    if (!note) return;
    if (richEditor) {
      const positions: number[] = [];
      richEditor.state.doc.descendants((node, position) => { if (["managedImage", "attachmentBlock"].includes(node.type.name) && node.attrs.attachmentId === attachment.id) positions.push(position); });
      for (const position of positions.reverse()) {
        const node = richEditor.state.doc.nodeAt(position);
        if (node) richEditor.view.dispatch(richEditor.state.tr.delete(position, position + node.nodeSize));
      }
    }
    const nextContent = note.content.replace(new RegExp(`!?\\[[^\\]]*\\]\\(secondbrain://attachment/${attachment.id}\\)|@\\[attachment\\]\\(${attachment.id}\\)`, "g"), "");
    if (nextContent !== note.content) {
      store.updateSelected({ content: nextContent });
    }
    if (!await store.flush(note.id)) throw new Error(language === "vi" ? "Không thể lưu ghi chú trước khi gỡ file" : "Could not save the note before removing the file");
    await storageService.unlink(note.id, attachment);
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
  };

  const removeAttachment = async (attachment: Attachment) => {
    await detachAttachment(attachment);
  };

  const updateLinkMode = async (preview: LinkPreview, mode: LinkPreview["display_mode"]) => {
    const updated = await noteService.saveLinkPreview({ ...preview, display_mode: mode });
    setLinkPreviews((current) => current.map((item) => item.url === preview.url ? updated : item));
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type !== "drop" || !store.selectedId || !event.payload.paths.length) return;
      const inspector = document.querySelector<HTMLElement>(".note-inspector");
      const inspectorRect = inspector?.getBoundingClientRect();
      const editor = document.querySelector<HTMLElement>(".editor-column");
      const rect = editor?.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const x = event.payload.position.x / scale;
      const y = event.payload.position.y / scale;
      if (inspectorRect && x >= inspectorRect.left && x <= inspectorRect.right && y >= inspectorRect.top && y <= inspectorRect.bottom) {
        void handleInspectorDroppedPath(event.payload.paths[0]);
      } else if (!rect || (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) {
        void handleDroppedPath(event.payload.paths[0]);
      }
    }).then((dispose) => { unlisten = dispose; }).catch(() => undefined);
    return () => { unlisten?.(); };
  }, [store.selectedId]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "n") { event.preventDefault(); void createNote(); }
      if (event.key.toLowerCase() === "s" && store.selectedId) { event.preventDefault(); void store.flush(store.selectedId); }
      if (event.key.toLowerCase() === "k") { event.preventDefault(); workspaceStore.setSidebarView("search"); window.setTimeout(() => document.querySelector<HTMLInputElement>(".file-explorer-search input")?.focus(), 0); }
      if (event.key.toLowerCase() === "w" && activeWorkspaceTab) { event.preventDefault(); void closeWorkspaceTab(activeWorkspaceTab); }
      if (event.key.toLowerCase() === "f" && event.shiftKey) { event.preventDefault(); workspaceStore.toggleFocusMode(); }
      if (event.key === "Tab" && workspace.tabs.length > 1) {
        event.preventDefault();
        const index = workspace.tabs.findIndex((tab) => tab.id === workspace.activeTabId);
        const next = workspace.tabs[(index + (event.shiftKey ? -1 : 1) + workspace.tabs.length) % workspace.tabs.length];
        if (next) void selectWorkspaceTab(next);
      }
      if (event.key.toLowerCase() === "o") { event.preventDefault(); workspaceStore.setSidebarView("files"); }
      if (event.key.toLowerCase() === "r" && recentNote) { event.preventDefault(); void openWorkspaceNote(recentNote, false); }
      if (event.key.toLowerCase() === "p") { event.preventDefault(); showNotice(language === "vi" ? "Command palette sẽ được mở rộng ở giai đoạn tiếp theo" : "Command palette will be expanded in a later phase"); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  if (!store.ready) return <div className="loading-screen"><span className="brand-mark large"><Brain size={28} /></span><strong>Second Brain</strong><span>{language === "vi" ? "Đang tải không gian làm việc..." : "Loading workspace..."}</span></div>;

  const viewTitle = view === "all" ? t.all : view === "favorites" ? t.favorites : view === "trash" ? t.trash : view === "unfiled" ? t.noFolder
    : store.folders.find((folder) => folder.id === folderId)?.name ?? t.folders;
  const activeCount = store.notes.filter((note) => !note.deleted_at).length;
  const favoriteCount = store.notes.filter((note) => !note.deleted_at && note.is_favorite).length;
  const trashCount = store.notes.filter((note) => note.deleted_at).length;
  const selectedFolder = store.folders.find((folder) => folder.id === store.selected?.folder_id);
  const contentStats = store.selected?.content ? `${store.selected.content.trim().split(/\s+/).filter(Boolean).length} ${language === "vi" ? "từ" : "words"} · ${store.selected.content.length} ${language === "vi" ? "ký tự" : "characters"}` : `0 ${language === "vi" ? "từ" : "words"}`;
  const emptyTitle = debouncedQuery ? t.noResults : view === "favorites" ? t.noFavorites : view === "trash" ? t.emptyTrash : t.empty;
  const emptyHint = debouncedQuery ? t.noResultsHint : view === "favorites" ? t.noFavoritesHint : view === "trash" ? t.emptyTrashHint : t.emptyHint;
  const editorStyle = {
    "--editor-font-family": editorFonts[editorSettings.fontFamily] ?? editorFonts.system,
    "--editor-font-size": `${editorSettings.fontSize}px`,
    "--editor-line-height": editorSettings.lineHeight,
    "--editor-content-width": `${editorSettings.contentWidth}px`,
  } as CSSProperties;
  const markdownActions = {
    language,
    onAttachmentUpdate: updateAttachment,
    onAttachmentRemove: removeAttachment,
    onAttachmentReplace: replaceAttachment,
    onLinkModeChange: updateLinkMode,
  };
  const activeWorkspaceTab = workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ?? null;
  const isTrashWorkspace = workspace.activeSidebarView === "trash";
  const ribbonActiveView = workspace.activeSidebarView;
  const createEmptyWorkspaceTab = async () => {
    if (!await flushForWorkspace(store.selectedId)) return;
    workspaceStore.createEmptyTab();
    await store.selectNote(null);
  };
  const selectRibbonView = async (view: WorkspaceSidebarView) => {
    if (view === "trash") {
      await openTrashView();
      return;
    }
    if (view === "favorites") setSidebarView({ type: "favorites" });
    if (view === "files") setSidebarView({ type: "all" });
    workspaceStore.setSidebarView(view);
    if (view === "files" && sidebarView.type === "trash") setSidebarView({ type: "all" });
    if (activeWorkspaceTab?.noteId) await store.selectNote(activeWorkspaceTab.noteId);
    else if (view !== "files") await store.selectNote(null);
  };
  const recentNote = [...store.notes].filter((note) => !note.deleted_at).sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];

  return <WorkspaceShell
    className={dark ? "dark" : "light"}
    style={editorStyle}
    sidebarVisible={workspace.sidebarVisible}
    sidebarWidth={workspace.sidebarWidth}
    focusMode={workspace.focusMode}
    inspectorWidth={workspace.inspectorWidth}
    onSidebarResize={(width) => workspaceStore.setSidebarWidth(width)}
    inspector={store.selected && !store.selected.deleted_at && workspace.inspectorOpen ? <NoteInspector open width={workspace.inspectorWidth} language={language} onClose={() => workspaceStore.setInspectorOpen(false)} onResize={(width) => workspaceStore.setInspectorWidth(width)} returnFocusRef={inspectorToggleRef}><AttachmentsPanel variant="inspector" noteId={store.selected.id} contentJson={store.selected.content_json} content={store.selected.content} language={language} onError={store.setError} onNotice={showNotice} onAdded={rememberAttachment} onRemove={detachAttachment} onInsert={insertImportedAttachment} /></NoteInspector> : null}
    ribbon={<Ribbon
      activeView={ribbonActiveView}
      sidebarVisible={workspace.sidebarVisible}
      onSelect={(view) => void selectRibbonView(view)}
      onSettings={() => void openSettings()}
      language={language}
    />}
    sidebar={isTrashWorkspace ? <TrashSidebar language={language} notes={trashNotes} folders={trashFolders} query={trashQuery} sort={trashSort} selectedNoteId={selectedTrashNote?.id ?? null} selectedFolderId={selectedTrashFolder?.id ?? null} checkedKeys={checkedTrashIds} onQueryChange={setTrashQuery} onSortChange={setTrashSort} onSelectNote={(id) => { setTrashSelectedId(id); setTrashSelectedFolderId(null); }} onSelectFolder={(id) => { setTrashSelectedFolderId(id); setTrashSelectedId(null); }} onToggleChecked={toggleTrashCheck} onToggleAll={() => setTrashCheckedIds((current) => current.size === trashItemKeys.size ? new Set() : new Set(trashItemKeys))} onRestoreAll={requestRestoreAllTrash} onEmptyTrash={requestEmptyTrash} /> : workspace.activeSidebarView === "files" ? <FilesSidebarLayout language={language} notes={store.notes} folders={store.folders} selectedId={store.selectedId} activeView={sidebarView.type === "folder" ? sidebarView : sidebarView.type === "unfiled" ? sidebarView : { type: "all" }} query={query} onQueryChange={setQuery} onNewNote={(folderId) => void createNote(folderId ?? null)} onNewFolder={(parentId) => setFolderDialog({ mode: "create", parentId: parentId ?? null, name: "" })} onSelectFolder={(folderId) => setSidebarView(folderId ? { type: "folder", folderId } : { type: "unfiled" })} onOpenNote={(note, pinned) => void openWorkspaceNote(note, pinned)} onMoveNote={moveNote} onToggleFavorite={(note) => updateNote(note, { is_favorite: note.is_favorite ? 0 : 1 })} onTrashNote={requestTrashNote} onRenameFolder={(folder) => setFolderDialog({ mode: "rename", id: folder.id, name: folder.name })} onTrashFolder={(folder) => requestDeleteFolder(folder.id, folder.name)} onRefresh={() => void store.refresh()} onSettings={() => void openSettings()} /> : workspace.activeSidebarView === "favorites" ? <FlatNotesSidebar language={language} mode="favorites" notes={store.notes} selectedId={store.selectedId} query={query} onQueryChange={setQuery} onNewNote={() => void createNote(null)} onOpenNote={(note, pinned) => void openWorkspaceNote(note, pinned)} onToggleFavorite={(note) => updateNote(note, { is_favorite: note.is_favorite ? 0 : 1 })} onTrashNote={requestTrashNote} onRefresh={() => void store.refresh()} onSettings={() => void openSettings()} /> : <SidebarViewPanel view={workspace.activeSidebarView as Exclude<WorkspaceSidebarView, "files" | "favorites" | "trash">} language={language} onSettings={() => void openSettings()} />}
    tabs={<WorkspaceTabs tabs={workspace.tabs} activeTabId={workspace.activeTabId} focusMode={workspace.focusMode} language={language} onSelect={(tab) => void selectWorkspaceTab(tab)} onClose={(tab) => void closeWorkspaceTab(tab)} onNew={() => void createEmptyWorkspaceTab()} onMove={(from, to) => workspaceStore.moveTab(from, to)} onToggleFocusMode={() => workspaceStore.toggleFocusMode()} />}
  >
    {isTrashWorkspace ? <TrashMain language={language} note={selectedTrashNote} folder={selectedTrashFolder} notes={trashNotes} folders={store.folders} checkedCount={checkedTrashIds.size} onRestoreNote={requestRestoreTrash} onDeleteNote={requestDeleteTrash} onRestoreFolder={requestRestoreTrashFolder} onDeleteFolder={requestDeleteTrashFolder} onRestoreSelected={restoreSelectedTrash} onDeleteSelected={requestDeleteSelectedTrash} onClearSelection={clearTrashSelection} /> : <>
    {activeWorkspaceTab?.noteId === null && <EmptyTab language={language} onCreate={() => void createNote()} onOpen={() => workspaceStore.setSidebarView("files")} onRecent={() => recentNote && void openWorkspaceNote(recentNote, false)} onCommand={() => showNotice(language === "vi" ? "Command palette sẽ được mở rộng ở giai đoạn tiếp theo" : "Command palette will be expanded in a later phase")} onClose={() => activeWorkspaceTab && void closeWorkspaceTab(activeWorkspaceTab)} />}
    <div className={`legacy-workspace-content ${activeWorkspaceTab?.noteId === null ? "is-hidden" : ""}`}>
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Brain size={23} /></span>
        <div><strong>Second Brain</strong><span>{language === "vi" ? "Không gian tri thức cá nhân" : "Personal knowledge space"}</span></div>
      </div>

      <button className="new-note" onClick={() => void createNote()}><Plus size={17} /><span>{t.newNote}</span><kbd>Ctrl N</kbd></button>

      <nav className="nav-list" aria-label={language === "vi" ? "Điều hướng chính" : "Main navigation"}>
        <button className={`nav-item ${view === "all" ? "active" : ""}`} onClick={() => chooseView("all")}><NotebookTabs size={18} /><span>{t.all}</span><span className="count">{activeCount}</span></button>
        <button className={`nav-item ${view === "favorites" ? "active" : ""}`} onClick={() => chooseView("favorites")}><Star size={18} /><span>{t.favorites}</span><span className="count">{favoriteCount}</span></button>
        <button className={`nav-item ${view === "trash" ? "active" : ""}`} onClick={() => chooseView("trash")}><Trash2 size={18} /><span>{t.trash}</span><span className="count">{trashCount}</span></button>
      </nav>

      <div className="folder-heading"><span>{t.folders}</span><button className="icon-button small" title={t.newFolder} aria-label={t.newFolder} onClick={() => setFolderDialog({ mode: "create", name: "" })}><FolderPlus size={17} /></button></div>
      <div className="folder-list">
        {store.folders.map((folder) => <div className={`folder-row ${view === "folder" && folderId === folder.id ? "active" : ""}`} key={folder.id}>
          <button className="folder-select" onClick={() => chooseView("folder", folder.id)}><Folder size={17} /><span>{folder.name}</span><small>{store.notes.filter((note) => !note.deleted_at && note.folder_id === folder.id).length}</small></button>
          <details className="row-menu">
            <summary className="icon-button small" title={language === "vi" ? "Thao tác thư mục" : "Folder actions"} aria-label={language === "vi" ? "Thao tác thư mục" : "Folder actions"}><MoreHorizontal size={16} /></summary>
            <div className="menu-popover">
              <button onClick={() => setFolderDialog({ mode: "rename", id: folder.id, name: folder.name })}><Pencil size={15} />{language === "vi" ? "Đổi tên" : "Rename"}</button>
              <button className="danger-text" onClick={() => requestDeleteFolder(folder.id, folder.name)}><Trash2 size={15} />{language === "vi" ? "Xóa thư mục" : "Delete folder"}</button>
            </div>
          </details>
        </div>)}
        {!store.folders.length && <div className="folders-empty"><Folder size={18} /><span>{language === "vi" ? "Chưa có thư mục" : "No folders yet"}</span></div>}
      </div>

      <div className="sidebar-footer">
        <button className={`footer-button ${settingsOpen ? "active" : ""}`} onClick={() => void openSettings()}><Settings2 size={18} /><span>{t.settings}</span></button>
        <div className="offline-indicator"><span className="status-dot" /><span>{language === "vi" ? "Dữ liệu lưu trên thiết bị" : "Data stored on device"}</span></div>
      </div>
    </aside>

    <section className="note-column">
      <header className="column-header">
        <div><span className="eyebrow">{view === "folder" ? t.folders : "WORKSPACE"}</span><h1>{viewTitle}</h1></div>
        <button className="icon-button emphasized" title={t.newNote} aria-label={t.newNote} onClick={() => void createNote()}><Plus size={18} /></button>
      </header>
      <div className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />{query ? <button title={language === "vi" ? "Xóa tìm kiếm" : "Clear search"} aria-label={language === "vi" ? "Xóa tìm kiếm" : "Clear search"} onClick={() => setQuery("")}><X size={15} /></button> : <kbd>Ctrl K</kbd>}</div>
      <div className="list-summary"><span>{debouncedQuery ? `${visibleNotes.length} ${t.results}` : `${visibleNotes.length} ${language === "vi" ? "ghi chú" : "notes"}`}</span>{debouncedQuery && <span>“{debouncedQuery}”</span>}</div>
      <div className="note-list">
        {visibleNotes.map((note) => {
          const folder = store.folders.find((item) => item.id === note.folder_id);
          return <article className={`note-card ${store.selectedId === note.id ? "selected" : ""}`} key={note.id}>
            <button className="note-card-main" onClick={() => void store.selectNote(note.id)}>
              <div className="note-card-top"><strong>{note.title || t.untitled}</strong><span className="card-flags">{note.is_pinned ? <Pin size={13} fill="currentColor" /> : null}{note.is_favorite ? <Star size={13} fill="currentColor" /> : null}</span></div>
              <p>{previewText(note.content, language)}</p>
              <footer>{folder && <span className="note-badge"><Folder size={11} />{folder.name}</span>}<time>{relativeTime(note.updated_at, language)}</time></footer>
            </button>
            {view === "trash" && <button className="card-restore" title={t.restore} aria-label={t.restore} onClick={() => void restoreNote(note.id)}><RotateCcw size={14} /></button>}
          </article>;
        })}
        {!visibleNotes.length && <div className="empty-list"><span className="empty-icon">{debouncedQuery ? <Search size={22} /> : view === "trash" ? <Trash2 size={22} /> : view === "favorites" ? <Star size={22} /> : <NotebookTabs size={22} />}</span><strong>{emptyTitle}</strong><p>{emptyHint}</p>{!debouncedQuery && view !== "trash" && <button className="secondary-button" onClick={() => void createNote()}><Plus size={15} />{t.newNote}</button>}</div>}
      </div>
    </section>

    <section className={`editor-column ${view === "trash" && !store.selected ? `trash-overview-shell ${visibleNotes.length ? "trash-has-notes" : "trash-empty"}` : ""}`}>
      {store.selected && !store.selected.deleted_at ? <>
        <header className="editor-header">
          <div className="breadcrumb"><span>{selectedFolder?.name ?? t.all}</span><ChevronRight size={14} /><strong>{store.selected.title || t.untitled}</strong></div>
          <div className="editor-actions">
            <select className="folder-select-box" aria-label={t.moveTo} value={store.selected.folder_id ?? ""} onChange={(event) => store.updateSelected({ folder_id: event.target.value || null })}>
              <option value="">{t.noFolder}</option>{store.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
            <button className={`icon-button ${store.selected.is_pinned ? "active" : ""}`} title={t.pin} aria-label={t.pin} aria-pressed={Boolean(store.selected.is_pinned)} onClick={() => store.updateSelected({ is_pinned: store.selected?.is_pinned ? 0 : 1 })}><Pin size={17} fill={store.selected.is_pinned ? "currentColor" : "none"} /></button>
            <button className={`icon-button favorite ${store.selected.is_favorite ? "active" : ""}`} title={t.favorite} aria-label={t.favorite} aria-pressed={Boolean(store.selected.is_favorite)} onClick={() => store.updateSelected({ is_favorite: store.selected?.is_favorite ? 0 : 1 })}><Star size={17} fill={store.selected.is_favorite ? "currentColor" : "none"} /></button>
            <button ref={inspectorToggleRef} className={`icon-button attachment-inspector-trigger ${workspace.inspectorOpen ? "active" : ""}`} title={language === "vi" ? "Hiện tệp đính kèm" : "Show attachments"} aria-label={language === "vi" ? "Hiện tệp đính kèm" : "Show attachments"} aria-pressed={workspace.inspectorOpen} onClick={() => workspaceStore.toggleInspector()}><Paperclip size={17} />{attachments.length > 0 && <span className="attachment-count-badge">{attachments.length}</span>}</button>
            <div className="editor-menu overlay-anchor" data-overlay-root><button className={`icon-button ${activeOverlay === "note-menu" ? "active" : ""}`} title={language === "vi" ? "Thêm thao tác" : "More actions"} aria-label={language === "vi" ? "Thêm thao tác" : "More actions"} onClick={() => overlayStore.toggle("note-menu")}><MoreHorizontal size={18} /></button>{activeOverlay === "note-menu" && <div className="menu-popover"><button className="danger-text" onClick={() => { overlayStore.set(null); moveSelectedToTrash(); }}><Trash2 size={15} />{t.moveTrash}</button></div>}</div>
          </div>
        </header>

        <div className="editor-tabbar">
          <div className="editor-tabs" role="tablist"><button role="tab" aria-selected={editorMode === "edit"} className={editorMode === "edit" ? "active" : ""} onClick={() => setEditorMode("edit")}>{t.edit}</button><button role="tab" aria-selected={editorMode === "preview"} className={editorMode === "preview" ? "active" : ""} onClick={() => setEditorMode("preview")}>{t.preview}</button></div>
          {(store.saveState === "saving" || store.saveState === "failed") && <div className={`save-state ${store.saveState}`}>{store.saveState === "failed" ? <TriangleAlert size={14} /> : <span className="save-pulse" />}{store.saveState === "saving" ? t.saving : t.failed}</div>}
        </div>
        {editorMode === "edit" && <CompactRichTextToolbar editor={richEditor} language={language} onImage={() => void chooseImage()} onAttachment={() => void chooseAttachment()} onLink={insertNormalLink} onYoutube={insertYoutube} attachmentDisabled={!storageStatus?.accessible || attachmentBusy} />}
        {pendingLink && <div className="link-choice-popover" role="dialog" aria-label={language === "vi" ? "Chọn kiểu hiển thị liên kết" : "Choose link display"}><div><strong>{language === "vi" ? "Hiển thị liên kết như thế nào?" : "How should this link display?"}</strong><span>{pendingLink.url}</span></div><button onClick={() => void chooseLinkDisplay("card")}>{language === "vi" ? "Thẻ liên kết" : "Link card"}</button>{classifyLink(pendingLink.url) === "youtube" && <button onClick={() => void chooseLinkDisplay("embed")}>{language === "vi" ? "Video nhúng" : "Embedded video"}</button>}<button onClick={() => void chooseLinkDisplay("link")}>{language === "vi" ? "Liên kết thường" : "Normal link"}</button><button className="icon-button small" title={language === "vi" ? "Hủy" : "Cancel"} aria-label={language === "vi" ? "Hủy" : "Cancel"} onClick={() => setPendingLink(null)}><X size={15} /></button></div>}

        <div className={`editor-scroll ${dropActive ? "drop-active" : ""}`} onDragOver={(event) => { if (hasAttachmentDrag(event.dataTransfer)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDropActive(false); return; } event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={handleDrop}>
          {attachmentBusy && <div className="attachment-progress" role="status"><span className="loading-spinner" />{language === "vi" ? "Đang nhập file…" : "Importing file…"}</div>}
          <article className="editor-canvas">
            <input ref={titleRef} className="title-input" value={store.selected.title} onChange={(event) => store.updateSelected({ title: event.target.value })} placeholder={t.untitled} />
            <button className="editor-meta-toggle" type="button" aria-expanded={metadataExpanded} onClick={() => setMetadataExpanded((value) => !value)}><Info size={14} /><span>{language === "vi" ? "Chi tiết" : "Details"}</span>{metadataExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
            {metadataExpanded && <div className="editor-meta"><span>{t.updated} {relativeTime(store.selected.updated_at, language)}</span><span>{contentStats}</span></div>}
            {store.saveState === "failed" && <div className="save-error"><TriangleAlert size={16} /><span>{store.error}</span><button onClick={() => void store.retrySave()}>{t.retry}</button></div>}
            <RichTextEditor note={store.selected} editable={editorMode === "edit"} language={language} attachments={attachments} linkPreviews={linkPreviews} actions={markdownActions} onPasteImage={importPastedImage} onUrlPaste={(url) => { overlayStore.set("link-choice"); setPendingLink({ url }); }} onDropFeedback={showNotice} onDocumentChange={handleDocumentChange} onReady={handleEditorReady} />
          </article>
        </div>
      </> : <div className="empty-editor"><span className="empty-icon"><Brain size={27} /></span><span className="eyebrow">SECOND BRAIN</span><h2>{t.welcome}</h2><p>{t.noSelection}</p><button className="primary-button" onClick={() => void createNote()}><Plus size={16} />{t.newNote}</button><div className="shortcut-hints"><span><kbd>Ctrl N</kbd>{language === "vi" ? "Tạo ghi chú" : "New note"}</span><span><kbd>Ctrl K</kbd>{language === "vi" ? "Tìm kiếm" : "Search"}</span></div></div>}
    </section>
    </div>
    </>}

    {store.error && store.saveState !== "failed" && <div className="toast error-toast" role="alert"><TriangleAlert size={17} /><span>{store.error}</span><button title="Đóng" aria-label="Đóng" onClick={() => store.setError(null)}><X size={16} /></button></div>}
    {notice && <div className="toast success-toast" role="status"><Check size={16} /><span>{notice}</span></div>}

    {folderDialog && <Modal title={folderDialog.mode === "create" ? t.newFolder : (language === "vi" ? "Đổi tên thư mục" : "Rename folder")} onClose={() => setFolderDialog(null)} className="compact-modal">
      <form className="dialog-form" onSubmit={(event) => void saveFolder(event)}><label>{language === "vi" ? "Tên thư mục" : "Folder name"}<input autoFocus value={folderDialog.name} onChange={(event) => setFolderDialog({ ...folderDialog, name: event.target.value })} placeholder={language === "vi" ? "Ví dụ: Công việc" : "For example: Work"} /></label><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setFolderDialog(null)}>{language === "vi" ? "Hủy" : "Cancel"}</button><button type="submit" className="primary-button" disabled={!folderDialog.name.trim()}>{folderDialog.mode === "create" ? (language === "vi" ? "Tạo thư mục" : "Create folder") : (language === "vi" ? "Lưu thay đổi" : "Save changes")}</button></div></form>
    </Modal>}

    {confirmDialog && <Modal title={confirmDialog.title} description={confirmDialog.description} onClose={() => { if (!confirmDialog.pending) setConfirmDialog(null); }} className="compact-modal danger-modal">
      {confirmDialog.error && <p className="dialog-error" role="alert">{confirmDialog.error}</p>}
      <div className="dialog-actions"><button className="secondary-button" disabled={confirmDialog.pending} onClick={() => setConfirmDialog(null)}>{language === "vi" ? "Hủy" : "Cancel"}</button><button className="danger-button" disabled={confirmDialog.pending} onClick={() => void confirmAction()}>{confirmDialog.pending ? (language === "vi" ? "Đang xử lý…" : "Working…") : <><Trash2 size={16} />{confirmDialog.confirm}</>}</button></div>
    </Modal>}

    {settingsOpen && <Modal title={t.settings} description={language === "vi" ? "Quản lý Workspace, giao diện và dữ liệu cục bộ." : "Manage Workspace, appearance, and local data."} onClose={() => setSettingsOpen(false)} className="settings-modal">
      <div className="settings-content">
        <section className="settings-section"><div className="settings-section-title"><HardDrive size={18} /><div><h3>Workspace</h3><p>{language === "vi" ? "Nơi lưu attachment, bản xuất, backup và thùng rác file." : "Stores attachments, exports, backups, and file trash."}</p></div></div>
          <div className="workspace-card"><div className="workspace-status"><span className={`status-dot ${storageStatus?.accessible ? "ok" : "bad"}`} /><strong>{storageStatus?.accessible ? (language === "vi" ? "Sẵn sàng" : "Available") : (language === "vi" ? "Chưa sẵn sàng" : "Unavailable")}</strong></div><code>{storageStatus?.root ?? (language === "vi" ? "Chưa chọn Workspace" : "No Workspace selected")}</code><div className="workspace-actions"><button className="primary-button" onClick={() => void chooseStorage()}><FolderOpen size={16} />{storageStatus ? (language === "vi" ? "Thay đổi Workspace" : "Change Workspace") : (language === "vi" ? "Chọn Workspace" : "Choose Workspace")}</button>{storageStatus?.accessible && <button className="secondary-button" onClick={() => void storageService.openRoot(storageStatus.root).catch((error: unknown) => store.setError(error instanceof Error ? error.message : String(error)))}><ExternalLink size={16} />{language === "vi" ? "Mở thư mục" : "Open folder"}</button>}</div></div>
          <div className="info-callout"><TriangleAlert size={16} /><span>{language === "vi" ? "Workspace mới chỉ áp dụng cho file thêm sau đó. File cũ vẫn dùng vị trí đã đăng ký trước đây." : "A new Workspace only applies to newly added files. Existing files keep using their registered locations."}</span></div>
        </section>

        <section className="settings-section"><div className="settings-section-title"><Monitor size={18} /><div><h3>{language === "vi" ? "Giao diện" : "Appearance"}</h3><p>{language === "vi" ? "Chọn chế độ màu phù hợp với bạn." : "Choose the color mode that suits you."}</p></div></div><div className="theme-grid">
          {([['dark', Moon, 'Dark'], ['light', Sun, 'Light'], ['system', Monitor, 'System']] as const).map(([value, Icon, label]) => <button className={theme === value ? "active" : ""} key={value} onClick={() => setTheme(value)}><Icon size={19} /><span>{label}</span>{theme === value && <Check size={14} />}</button>)}
        </div></section>

        <section className="settings-section"><div className="settings-section-title"><Settings2 size={18} /><div><h3>{language === "vi" ? "Ngôn ngữ" : "Language"}</h3><p>{language === "vi" ? "Ngôn ngữ mặc định của ứng dụng." : "The app's default language."}</p></div></div><div className="segmented-control"><button className={language === "vi" ? "active" : ""} onClick={() => setLanguage("vi")}>Tiếng Việt</button><button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>English</button></div></section>

        <section className="settings-section"><div className="settings-section-title"><CopyIcon size={18} /><div><h3>{language === "vi" ? "Đính kèm file" : "Attachments"}</h3><p>{language === "vi" ? "Chọn cách Second Brain quản lý file mới." : "Choose how Second Brain manages new files."}</p></div></div><div className="mode-options">
          <button className={importMode === "managed" ? "active" : ""} onClick={() => void changeImportMode("managed")}><span className="radio-mark" /><CopyIcon size={18} /><span><strong>{language === "vi" ? "Sao chép vào Workspace" : "Copy into Workspace"}</strong><small>{language === "vi" ? "Khuyến nghị. Bản sao an toàn nằm trong Workspace." : "Recommended. A safe copy lives in your Workspace."}</small></span></button>
          <button className={importMode === "linked" ? "active" : ""} onClick={() => void changeImportMode("linked")}><span className="radio-mark" /><Link2 size={18} /><span><strong>{language === "vi" ? "Liên kết file gốc" : "Link original file"}</strong><small>{language === "vi" ? "Không sao chép; liên kết có thể mất nếu file bị di chuyển." : "No copy; the link can break if the file moves."}</small></span></button>
        </div></section>

        <section className="settings-section"><div className="settings-section-title"><DatabaseBackup size={18} /><div><h3>{language === "vi" ? "Sao lưu & khôi phục" : "Backup & restore"}</h3><p>{language === "vi" ? "Backup được kiểm tra trước khi có thể khôi phục." : "Backups are validated before they can be restored."}</p></div><button className="secondary-button section-action" onClick={() => void createBackup()}><DatabaseBackup size={15} />{language === "vi" ? "Tạo backup" : "Create backup"}</button></div><div className="backup-list">{backups.length ? backups.map((name) => <div className="backup-row" key={name}><span>{name}</span><button onClick={() => requestRestoreBackup(name)}><RotateCcw size={14} />{t.restore}</button></div>) : <div className="backup-empty">{language === "vi" ? "Chưa có bản sao lưu" : "No backups yet"}</div>}</div></section>
      </div>
    </Modal>}
  </WorkspaceShell>;
}

export default App;
