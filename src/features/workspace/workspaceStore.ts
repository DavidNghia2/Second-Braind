import { load } from "@tauri-apps/plugin-store";
import { useSyncExternalStore } from "react";

export type SidebarView = "files" | "search" | "favorites" | "trash" | "bookmarks" | "tags" | "calendar" | "graph" | "settings";

export type WorkspaceTab = {
  id: string;
  noteId: string | null;
  title: string;
  isPinned: boolean;
  isPreview: boolean;
};

type WorkspaceState = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  sidebarVisible: boolean;
  sidebarWidth: number;
  activeSidebarView: SidebarView;
  focusMode: boolean;
  inspectorOpen: boolean;
  inspectorWidth: number;
  recentNoteIds: string[];
  hydrated: boolean;
};

const DEFAULT_TAB_TITLE = "New tab";
const DEFAULT_STATE: WorkspaceState = {
  tabs: [],
  activeTabId: "",
  sidebarVisible: true,
  sidebarWidth: 280,
  activeSidebarView: "files",
  focusMode: false,
  inspectorOpen: false,
  inspectorWidth: 320,
  recentNoteIds: [],
  hydrated: false,
};

let state: WorkspaceState = DEFAULT_STATE;
const listeners = new Set<() => void>();
let hydration: Promise<void> | null = null;
let persistQueue = Promise.resolve();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const createId = () => {
  try { return crypto.randomUUID(); } catch { return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
};

const makeEmptyTab = (): WorkspaceTab => ({ id: createId(), noteId: null, title: DEFAULT_TAB_TITLE, isPinned: false, isPreview: false });

const notify = () => listeners.forEach((listener) => listener());

const persist = (next: WorkspaceState) => {
  if (!next.hydrated) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistQueue = persistQueue.catch(() => undefined).then(async () => {
      try {
        const store = await load("workspace.json", { defaults: {}, autoSave: 300 });
        await store.set("tabs", next.tabs);
        await store.set("activeTabId", next.activeTabId);
        await store.set("sidebarVisible", next.sidebarVisible);
        await store.set("sidebarWidth", next.sidebarWidth);
        await store.set("activeSidebarView", next.activeSidebarView);
        await store.set("focusMode", next.focusMode);
        await store.set("inspectorOpen", next.inspectorOpen);
        await store.set("inspectorWidth", next.inspectorWidth);
        await store.set("recentNoteIds", next.recentNoteIds);
      } catch {
        // Workspace persistence is best effort; note data remains in SQLite.
      }
    });
  }, 180);
};

const update = (patch: Partial<WorkspaceState>) => {
  state = { ...state, ...patch };
  notify();
  persist(state);
};

const validSidebarView = (value: unknown): value is SidebarView =>
  ["files", "search", "favorites", "trash", "bookmarks", "tags", "calendar", "graph", "settings"].includes(String(value));

export const workspaceStore = {
  get: () => state,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  async hydrate(validNoteIds: Set<string>) {
    if (hydration) return hydration;
    hydration = (async () => {
      try {
        const store = await load("workspace.json", { defaults: {}, autoSave: 300 });
        const savedTabs = await store.get<WorkspaceTab[]>("tabs");
        const tabs = Array.isArray(savedTabs)
          ? savedTabs.filter((tab) => tab && typeof tab.id === "string" && (tab.noteId === null || validNoteIds.has(tab.noteId)))
            .map((tab) => ({
              id: tab.id,
              noteId: tab.noteId,
              title: typeof tab.title === "string" && tab.title.trim() ? tab.title : DEFAULT_TAB_TITLE,
              isPinned: Boolean(tab.isPinned),
              isPreview: Boolean(tab.isPreview),
            }))
          : [];
        const nextTabs = tabs.length ? tabs : [makeEmptyTab()];
        const savedActive = await store.get<string>("activeTabId");
        const savedWidth = await store.get<number>("sidebarWidth");
        const savedView = await store.get<SidebarView>("activeSidebarView");
        const savedVisible = await store.get<boolean>("sidebarVisible");
        const savedFocusMode = await store.get<boolean>("focusMode");
        const savedInspectorOpen = await store.get<boolean>("inspectorOpen");
        const savedInspectorWidth = await store.get<number>("inspectorWidth");
        const savedRecent = await store.get<string[]>("recentNoteIds");
        state = {
          tabs: nextTabs,
          activeTabId: nextTabs.some((tab) => tab.id === savedActive) ? savedActive! : nextTabs[0].id,
          sidebarVisible: savedVisible !== false,
          sidebarWidth: Math.min(440, Math.max(220, Number(savedWidth) || 280)),
          activeSidebarView: validSidebarView(savedView) ? savedView : "files",
          focusMode: savedFocusMode === true,
          inspectorOpen: savedInspectorOpen === true,
          inspectorWidth: Math.min(440, Math.max(280, Number(savedInspectorWidth) || 320)),
          recentNoteIds: Array.isArray(savedRecent) ? savedRecent.filter((id): id is string => typeof id === "string" && validNoteIds.has(id)).slice(0, 20) : [],
          hydrated: true,
        };
      } catch {
        const tab = makeEmptyTab();
        state = { ...DEFAULT_STATE, tabs: [tab], activeTabId: tab.id, hydrated: true };
      }
      notify();
    })();
    return hydration;
  },
  createEmptyTab() {
    const tab = makeEmptyTab();
    update({ tabs: [...state.tabs, tab], activeTabId: tab.id });
    return tab;
  },
  openNote(noteId: string, title: string, options: { pinned?: boolean; preview?: boolean } = {}) {
    const pinned = Boolean(options.pinned);
    const preview = options.preview ?? !pinned;
    const recentNoteIds = [noteId, ...state.recentNoteIds.filter((id) => id !== noteId)].slice(0, 20);
    const existing = state.tabs.find((tab) => tab.noteId === noteId);
    if (existing) {
      const tabs = state.tabs.map((tab) => tab.id === existing.id ? { ...tab, title, isPinned: existing.isPinned || pinned, isPreview: pinned ? false : existing.isPreview } : tab);
      update({ tabs, activeTabId: existing.id, recentNoteIds });
      return existing;
    }
    let tabs = state.tabs;
    const activeEmpty = tabs.find((tab) => tab.id === state.activeTabId && tab.noteId === null && !tab.isPinned);
    if (activeEmpty) {
      const replaced = { ...activeEmpty, noteId, title, isPinned: pinned, isPreview: preview };
      tabs = tabs.map((tab) => tab.id === activeEmpty.id ? replaced : tab);
      update({ tabs, activeTabId: replaced.id, recentNoteIds });
      return replaced;
    }
    if (preview) {
      const previewTab = tabs.find((tab) => tab.isPreview && !tab.isPinned);
      if (previewTab) {
        const replaced = { ...previewTab, noteId, title, isPinned: false, isPreview: true };
        tabs = tabs.map((tab) => tab.id === previewTab.id ? replaced : tab);
        update({ tabs, activeTabId: replaced.id, recentNoteIds });
        return replaced;
      }
    }
    const tab: WorkspaceTab = { id: createId(), noteId, title, isPinned: pinned, isPreview: preview };
    update({ tabs: [...tabs, tab], activeTabId: tab.id, recentNoteIds });
    return tab;
  },
  selectTab(id: string) {
    if (state.tabs.some((tab) => tab.id === id)) update({ activeTabId: id });
  },
  rememberRecent(noteId: string) { update({ recentNoteIds: [noteId, ...state.recentNoteIds.filter((id) => id !== noteId)].slice(0, 20) }); },
  removeRecent(noteIds: Iterable<string>) { const removed = new Set(noteIds); update({ recentNoteIds: state.recentNoteIds.filter((id) => !removed.has(id)) }); },
  closeTab(id: string) {
    const index = state.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
    let tabs = state.tabs.filter((tab) => tab.id !== id);
    if (!tabs.length) tabs = [makeEmptyTab()];
    const nextActive = id === state.activeTabId
      ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? tabs[0].id)
      : state.activeTabId;
    update({ tabs, activeTabId: tabs.some((tab) => tab.id === nextActive) ? nextActive : tabs[0].id });
    return tabs.find((tab) => tab.id === (id === state.activeTabId ? nextActive : state.activeTabId)) ?? tabs[0];
  },
  moveTab(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= state.tabs.length || to >= state.tabs.length) return;
    const tabs = [...state.tabs];
    const [tab] = tabs.splice(from, 1);
    tabs.splice(to, 0, tab);
    update({ tabs });
  },
  renameTab(id: string, title: string) {
    if (state.tabs.find((tab) => tab.id === id)?.title === title) return;
    update({ tabs: state.tabs.map((tab) => tab.id === id ? { ...tab, title } : tab) });
  },
  toggleSidebar() { update({ sidebarVisible: !state.sidebarVisible }); },
  setSidebarView(view: SidebarView) {
    update({ activeSidebarView: state.activeSidebarView === view && state.sidebarVisible ? state.activeSidebarView : view, sidebarVisible: state.activeSidebarView === view ? !state.sidebarVisible : true });
  },
  setSidebarWidth(width: number) { update({ sidebarWidth: Math.min(440, Math.max(220, Math.round(width))) }); },
  setFocusMode(focusMode: boolean) { update({ focusMode }); },
  toggleFocusMode() { update({ focusMode: !state.focusMode }); },
  setInspectorOpen(inspectorOpen: boolean) { update({ inspectorOpen }); },
  toggleInspector() { update({ inspectorOpen: !state.inspectorOpen }); },
  setInspectorWidth(inspectorWidth: number) { update({ inspectorWidth: Math.min(440, Math.max(280, Math.round(inspectorWidth))) }); },
};

export function useWorkspaceStore() {
  return useSyncExternalStore(workspaceStore.subscribe, workspaceStore.get, workspaceStore.get);
}

export { DEFAULT_TAB_TITLE };
