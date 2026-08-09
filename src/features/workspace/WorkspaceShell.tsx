import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";

export function WorkspaceShell({ ribbon, sidebar, tabs, inspector, inspectorWidth, children, sidebarVisible, sidebarWidth, focusMode, onSidebarResize, style, className = "" }: {
  ribbon: ReactNode;
  sidebar: ReactNode;
  tabs: ReactNode;
  inspector?: ReactNode;
  inspectorWidth?: number;
  children: ReactNode;
  sidebarVisible: boolean;
  sidebarWidth: number;
  focusMode: boolean;
  onSidebarResize: (width: number) => void;
  style?: CSSProperties;
  className?: string;
}) {
  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const move = (moveEvent: PointerEvent) => onSidebarResize(startWidth + moveEvent.clientX - startX);
    const finish = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish, { once: true });
  };
  const navigationVisible = sidebarVisible && !focusMode;
  return <main className={`app-shell workspace-shell ${navigationVisible ? "sidebar-open" : "sidebar-collapsed"} ${focusMode ? "focus-mode" : ""} ${className}`} style={{ ...style, "--workspace-sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
    {!focusMode && <aside className="workspace-ribbon">{ribbon}</aside>}
    {navigationVisible && <><aside className="workspace-file-explorer" style={{ width: sidebarWidth }}>{sidebar}</aside><div className="workspace-sidebar-resizer" role="separator" aria-orientation="vertical" onPointerDown={beginResize} /></>}
    <section className={`workspace-main ${inspector ? "inspector-open" : ""}`} style={{ "--note-inspector-width": inspectorWidth ? `${inspectorWidth}px` : undefined } as CSSProperties}><div className="workspace-tabs-slot">{tabs}</div>{children}{inspector}</section>
  </main>;
}
