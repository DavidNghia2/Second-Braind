import { useEffect, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

export function NoteInspector({ open, width, onClose, onResize, returnFocusRef, children, language }: {
  open: boolean;
  width: number;
  onClose: () => void;
  onResize: (width: number) => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
  language: "vi" | "en";
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);
  const close = () => { onClose(); window.setTimeout(() => returnFocusRef?.current?.focus(), 0); };
  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => onResize(startWidth - (moveEvent.clientX - startX));
    const finish = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", finish); };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish, { once: true });
  };
  if (!open) return null;
  return <aside className="note-inspector" style={{ "--note-inspector-width": `${width}px` } as CSSProperties} aria-label={language === "vi" ? "Tệp đính kèm" : "Attachments"}>
    <div className="note-inspector-resizer" role="separator" aria-orientation="vertical" onPointerDown={beginResize} />
    <header className="note-inspector-header"><strong>{language === "vi" ? "Tệp đính kèm" : "Attachments"}</strong><button className="icon-button small" type="button" title={language === "vi" ? "Đóng tệp đính kèm" : "Close attachments"} aria-label={language === "vi" ? "Đóng tệp đính kèm" : "Close attachments"} onClick={close}><X size={16} /></button></header>
    <div className="note-inspector-body">{children}</div>
  </aside>;
}
