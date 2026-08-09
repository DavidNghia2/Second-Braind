import { Bookmark, FolderOpen, Search, Settings2, Star, Trash2 } from "lucide-react";
import type { SidebarView } from "../workspace/workspaceStore";

type RibbonView = SidebarView | "settings";

const items: Array<[SidebarView, typeof FolderOpen]> = [
  ["files", FolderOpen],
  ["search", Search],
  ["favorites", Star],
  ["trash", Trash2],
  ["bookmarks", Bookmark],
];

export function Ribbon({ activeView, sidebarVisible, onSelect, onSettings, language }: { activeView: RibbonView; sidebarVisible: boolean; onSelect: (view: SidebarView) => void; onSettings: () => void; language: "vi" | "en" }) {
  const labels: Record<RibbonView, string> = language === "vi"
    ? { files: "Tệp", search: "Tìm kiếm", favorites: "Yêu thích", trash: "Thùng rác", bookmarks: "Đánh dấu", tags: "Thẻ", calendar: "Lịch", graph: "Đồ thị", settings: "Cài đặt" }
    : { files: "Files", search: "Search", favorites: "Favorites", trash: "Trash", bookmarks: "Bookmarks", tags: "Tags", calendar: "Calendar", graph: "Graph", settings: "Settings" };
  return <nav className="workspace-ribbon-nav" aria-label={language === "vi" ? "Điều hướng workspace" : "Workspace navigation"}>
    {items.map(([view, Icon]) => <button key={view} className={`workspace-ribbon-button ${sidebarVisible && activeView === view ? "active" : ""}`} title={labels[view]} aria-label={labels[view]} aria-pressed={sidebarVisible && activeView === view} onClick={() => onSelect(view)}><Icon size={19} strokeWidth={1.8} /></button>)}
    <button className={`workspace-ribbon-button ${sidebarVisible && activeView === "settings" ? "active" : ""}`} title={labels.settings} aria-label={labels.settings} onClick={onSettings}><Settings2 size={19} strokeWidth={1.8} /></button>
  </nav>;
}
