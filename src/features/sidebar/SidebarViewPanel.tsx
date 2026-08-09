import { Bookmark, CalendarDays, GitGraph, Search, Settings2, Tags } from "lucide-react";
import type { SidebarView } from "../workspace/workspaceStore";

export function SidebarViewPanel({ view, language, onSettings }: { view: Exclude<SidebarView, "files" | "favorites" | "trash">; language: "vi" | "en"; onSettings: () => void }) {
  const vi = language === "vi";
  const config = {
    search: [Search, vi ? "Tìm kiếm" : "Search", vi ? "Dùng Ctrl K để tìm nhanh trong toàn bộ ghi chú." : "Use Ctrl K to search across all notes."],
    bookmarks: [Bookmark, vi ? "Đánh dấu" : "Bookmarks", vi ? "Các ghi chú yêu thích sẽ xuất hiện trong khu vực này." : "Favorite notes will appear in this view."],
    tags: [Tags, vi ? "Thẻ" : "Tags", vi ? "Trình duyệt thẻ sẽ được bổ sung ở giai đoạn tiếp theo." : "The tag browser will be added in a later phase."],
    calendar: [CalendarDays, vi ? "Lịch" : "Calendar", vi ? "Lịch ghi chú sẽ được bổ sung ở giai đoạn tiếp theo." : "The note calendar will be added in a later phase."],
    graph: [GitGraph, vi ? "Đồ thị" : "Graph", vi ? "Graph view sẽ được bổ sung mà không thay đổi dữ liệu ghi chú." : "Graph view will be added without changing note data."],
    settings: [Settings2, vi ? "Cài đặt" : "Settings", vi ? "Mở phần cài đặt hiện có của Second Brain." : "Open the existing Second Brain settings."],
  } as const;
  const [Icon, title, description] = config[view];
  return <div className="sidebar-view-panel"><header><span className="eyebrow">SECOND BRAIN</span><h2>{title}</h2></header><div className="sidebar-view-empty"><Icon size={27} /><strong>{title}</strong><p>{description}</p>{view === "settings" && <button className="secondary-button" onClick={onSettings}><Settings2 size={15} />{vi ? "Mở cài đặt" : "Open settings"}</button>}</div></div>;
}
