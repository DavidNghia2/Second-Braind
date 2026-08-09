import { Maximize2, Minimize2, Pin, Plus, X } from "lucide-react";
import type { WorkspaceTab } from "./workspaceStore";

export function WorkspaceTabs({ tabs, activeTabId, focusMode, onSelect, onClose, onNew, onMove, onToggleFocusMode, language }: {
  tabs: WorkspaceTab[];
  activeTabId: string;
  focusMode: boolean;
  onSelect: (tab: WorkspaceTab) => void;
  onClose: (tab: WorkspaceTab) => void;
  onNew: () => void;
  onMove: (from: number, to: number) => void;
  onToggleFocusMode: () => void;
  language: "vi" | "en";
}) {
  return <div className="workspace-tabbar" role="tablist" aria-label={language === "vi" ? "Các tab ghi chú" : "Workspace tabs"}>
    <div className="workspace-tab-list">
      {tabs.map((tab, index) => <button key={tab.id} role="tab" aria-selected={tab.id === activeTabId} draggable onClick={() => onSelect(tab)} onMouseDown={(event) => { if (event.button === 1) { event.preventDefault(); onClose(tab); } }} onDragStart={(event) => { event.dataTransfer.setData("text/plain", String(index)); event.dataTransfer.effectAllowed = "move"; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/plain")); if (Number.isInteger(from)) onMove(from, index); }} className={`workspace-tab ${tab.id === activeTabId ? "active" : ""}`}>
        {tab.isPinned && <Pin size={12} fill="currentColor" />}
        <span>{tab.title}</span>
        <span className="workspace-tab-close" role="button" aria-label={language === "vi" ? "Đóng tab" : "Close tab"} onClick={(event) => { event.stopPropagation(); onClose(tab); }}><X size={13} /></span>
      </button>)}
    </div>
    <button className="workspace-tab-new" title={language === "vi" ? "Tab mới" : "New tab"} aria-label={language === "vi" ? "Tab mới" : "New tab"} onClick={onNew}><Plus size={18} /></button>
    <button className={`workspace-focus-toggle ${focusMode ? "active" : ""}`} title={language === "vi" ? (focusMode ? "Thoát chế độ tập trung (Ctrl Shift F)" : "Chế độ tập trung (Ctrl Shift F)") : (focusMode ? "Exit focus mode (Ctrl Shift F)" : "Focus mode (Ctrl Shift F)")} aria-label={language === "vi" ? (focusMode ? "Thoát chế độ tập trung" : "Chế độ tập trung") : (focusMode ? "Exit focus mode" : "Focus mode")} aria-pressed={focusMode} onClick={onToggleFocusMode}>{focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
  </div>;
}
