import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileImage,
  FileText,
  FolderOpen,
  Link2,
  MoreHorizontal,
  Paperclip,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { noteService } from "./noteService";
import { storageService } from "./storageService";
import type { Attachment } from "./types";
import { overlayStore, useActiveOverlay } from "../editor/overlayStore";
import { ATTACHMENT_DRAG_MIME, beginAttachmentDrag, endAttachmentDrag, type AttachmentDragPayload } from "../editor/attachmentDrag";

const bytes = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

type AttachmentRow = Attachment & { available?: boolean };

const attachmentIdsInDocument = (value: unknown, ids = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) { value.forEach((item) => attachmentIdsInDocument(item, ids)); return ids; }
  if (!value || typeof value !== "object") return ids;
  const record = value as Record<string, unknown>;
  if ((record.type === "managedImage" || record.type === "attachmentBlock") && record.attrs && typeof record.attrs === "object") {
    const id = (record.attrs as Record<string, unknown>).attachmentId;
    if (typeof id === "string" && id) ids.add(id);
  }
  Object.values(record).forEach((item) => attachmentIdsInDocument(item, ids));
  return ids;
};

export function AttachmentsPanel({
  noteId,
  language,
  onError,
  onNotice,
  onAdded,
  onRemove,
  contentJson,
  content,
  expanded = false,
  onExpandedChange,
  variant = "inline",
  onInsert,
}: {
  noteId: string;
  language: "vi" | "en";
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onAdded?: (attachment: Attachment) => void;
  onRemove?: (attachment: Attachment) => Promise<void>;
  contentJson?: string | null;
  content?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  variant?: "inline" | "inspector";
  onInsert?: (attachment: Attachment) => void;
}) {
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const activeOverlay = useActiveOverlay();
  const vi = language === "vi";

  const refresh = useCallback(async () => {
    const rows = await noteService.listAttachments(noteId);
    const ids = new Set<string>();
    if (contentJson) {
      try { attachmentIdsInDocument(JSON.parse(contentJson), ids); } catch { /* legacy or incomplete document */ }
    }
    for (const match of (content ?? "").matchAll(/(?:secondbrain:\/\/attachment\/|@\[attachment\]\()([^\)\s]+)/g)) ids.add(match[1]);
    const fromDocument = await Promise.all([...ids].map(async (id) => {
      const item = await noteService.getAttachment(id);
      return item ?? {
        id, note_id: noteId, storage_location_id: null, original_name: id, stored_name: null, mime_type: null, size_bytes: 0,
        storage_mode: "linked" as const, relative_path: null, external_path: null, display_mode: "card" as const, caption: null,
        width_mode: "medium" as const, created_at: new Date(0).toISOString(), deleted_at: null,
      };
    }));
    const merged = [...rows, ...fromDocument.filter((item) => !rows.some((row) => row.id === item.id))];
    const checked = await Promise.all(merged.map(async (item) => ({
      ...item,
      available: await storageService.isAvailable(item),
    })));
    setAttachments(checked);
  }, [content, contentJson, noteId]);

  useEffect(() => {
    void refresh().catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
  }, [onError, refresh]);

  const add = async () => {
    setBusy(true);
    try {
      const added = await storageService.importForNote(noteId);
      if (added) {
        await refresh();
        onAdded?.(added);
        onNotice(vi ? "Đã thêm file vào danh sách đính kèm" : "File added to attachments");
      }
    } catch (error: unknown) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (attachment: Attachment) => {
    if (!window.confirm(vi
      ? `Gỡ “${attachment.original_name}” khỏi ghi chú? Bản sao/file gốc sẽ không bị xóa.`
      : `Remove “${attachment.original_name}” from this note? The physical file will be kept.`)) return;
    setBusy(true);
    try {
      if (onRemove) await onRemove(attachment);
      else await storageService.unlink(noteId, attachment);
      await refresh();
      onNotice(vi ? "Đã gỡ file khỏi ghi chú" : "Attachment removed");
    } catch (error: unknown) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const runFileAction = async (action: () => Promise<void>) => {
    overlayStore.set(null);
    try {
      await action();
    } catch (error: unknown) {
      onError(error instanceof Error ? error.message : (vi ? "Không tìm thấy file" : "File not found"));
      await refresh().catch(() => undefined);
    }
  };

  const isInspector = variant === "inspector";
  const isOpen = isInspector || expanded;
  return <section className={`attachments-panel ${isInspector ? "attachments-panel-inspector" : ""}`} aria-label={vi ? "Tệp đính kèm" : "Attachments"}>
    <div className="attachments-heading">
      {isInspector ? <div className="attachments-inspector-title"><Paperclip size={16} /><span>{vi ? "Tệp đính kèm" : "Attachments"}</span><span className="section-count">{attachments.length}</span></div> : <button className="attachments-toggle" type="button" aria-expanded={expanded} onClick={() => onExpandedChange?.(!expanded)}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Paperclip size={16} /><span>{vi ? "Tệp đính kèm" : "Attachments"}</span><span className="section-count">{attachments.length}</span></button>}
      {isOpen && <button id={`add-attachment-${noteId}`} className="text-button" disabled={busy} onClick={() => void add()}><Upload size={15} />{vi ? "Thêm file" : "Add file"}</button>}
    </div>

    {isOpen && (attachments.length ? <div className="attachment-list">{attachments.map((attachment) => {
      const isPdf = attachment.mime_type?.toLowerCase() === "pdf" || attachment.original_name.toLowerCase().endsWith(".pdf");
      const available = attachment.available !== false;
      return <article
        className="attachment-card"
        key={attachment.id}
        data-attachment-id={attachment.id}
        data-attachment-mime={attachment.mime_type ?? ""}
        data-attachment-name={attachment.original_name}
        draggable
        onDragStart={(event) => {
          if ((event.target as HTMLElement | null)?.closest("[data-attachment-actions]")) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          overlayStore.set(null);
          const payload: AttachmentDragPayload = { attachmentId: attachment.id, mimeType: attachment.mime_type, originalName: attachment.original_name };
          beginAttachmentDrag(payload);
          event.currentTarget.classList.add("is-dragging");
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(ATTACHMENT_DRAG_MIME, JSON.stringify(payload));
          event.dataTransfer.setData("text/plain", attachment.original_name);
        }}
        onDragEnd={(event) => { event.currentTarget.classList.remove("is-dragging"); endAttachmentDrag(attachment.id); }}
      >
        <div className={`attachment-type ${isPdf ? "pdf" : "image"}`}>{isPdf ? <FileText size={20} /> : <FileImage size={20} />}</div>
        <div className="attachment-info">
          <strong title={attachment.original_name}>{attachment.original_name}</strong>
          <div className="attachment-meta">
            <span>{bytes(attachment.size_bytes)}</span>
            <span className="meta-dot" />
            <span>{attachment.storage_mode === "managed" ? <Paperclip size={12} /> : <Link2 size={12} />}{attachment.storage_mode === "managed" ? "Managed" : "Linked"}</span>
            <span className="meta-dot" />
            <span className={available ? "available" : "missing"}>{available ? <CheckCircle2 size={12} /> : <TriangleAlert size={12} />}{available ? (vi ? "Sẵn sàng" : "Available") : (vi ? "Thất lạc" : "Missing")}</span>
          </div>
        </div>
        <div className="attachment-menu" data-attachment-actions data-overlay-root draggable={false} onPointerDown={(event) => event.stopPropagation()} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}>
          <button className={`icon-button small ${activeOverlay === `attachment-panel:${attachment.id}` ? "active" : ""}`} title={vi ? "Thao tác file" : "File actions"} aria-label={vi ? "Thao tác file" : "File actions"} onClick={() => overlayStore.toggle(`attachment-panel:${attachment.id}`)}><MoreHorizontal size={16} /></button>
          {activeOverlay === `attachment-panel:${attachment.id}` && <div className="menu-popover">
            <button disabled={!available} onClick={() => void runFileAction(() => storageService.open(attachment))}><ExternalLink size={15} />{vi ? "Mở file" : "Open file"}</button>
            <button disabled={!available} onClick={() => void runFileAction(() => storageService.reveal(attachment))}><FolderOpen size={15} />{vi ? "Hiện trong Explorer" : "Show in Explorer"}</button>
            {onInsert && <button onClick={() => { overlayStore.set(null); onInsert(attachment); }}><FileText size={15} />{vi ? "Chèn vào soạn thảo" : "Insert into editor"}</button>}
            <button className="danger-text" disabled={busy} onClick={() => { overlayStore.set(null); void remove(attachment); }}><Trash2 size={15} />{vi ? "Gỡ khỏi ghi chú" : "Remove from note"}</button>
          </div>}
        </div>
      </article>;
    })}</div> : <div className="attachment-empty-state"><Paperclip size={24} /><strong>{vi ? "Chưa có tệp đính kèm" : "No attachments yet"}</strong><span>{vi ? "Thêm tệp khi bạn cần tài liệu tham khảo cho ghi chú này." : "Add a file when this note needs supporting material."}</span><button id={`add-attachment-${noteId}`} className="attachment-dropzone" disabled={busy} onClick={() => void add()}>
      <span className="dropzone-icon"><Upload size={19} /></span>
      <strong>{vi ? "Đính kèm PDF hoặc hình ảnh" : "Attach a PDF or image"}</strong>
      <span>{vi ? "Nhấp để chọn file từ máy của bạn" : "Click to choose a file from your computer"}</span>
    </button></div>)}
  </section>;
}
