export const ATTACHMENT_DRAG_MIME = "application/x-secondbrain-attachment";

export type AttachmentDragPayload = {
  attachmentId: string;
  mimeType: string | null;
  originalName: string;
};

let activeAttachmentDrag: AttachmentDragPayload | null = null;

function readAttachmentDragFromDom(): AttachmentDragPayload | null {
  if (typeof document === "undefined") return null;
  const card = document.querySelector<HTMLElement>(".attachment-card.is-dragging");
  if (!card) return null;
  const attachmentId = card.dataset.attachmentId?.trim();
  if (!attachmentId) return null;
  return {
    attachmentId,
    mimeType: card.dataset.attachmentMime?.trim() || null,
    originalName: card.dataset.attachmentName?.trim() || "attachment",
  };
}

export function beginAttachmentDrag(payload: AttachmentDragPayload) {
  activeAttachmentDrag = payload;
}

export function endAttachmentDrag(attachmentId?: string) {
  if (!attachmentId || activeAttachmentDrag?.attachmentId === attachmentId) activeAttachmentDrag = null;
}

export function readAttachmentDrag(dataTransfer: DataTransfer | null): AttachmentDragPayload | null {
  let raw = "";
  try {
    raw = dataTransfer?.getData(ATTACHMENT_DRAG_MIME) ?? "";
  } catch {
    // WebView2 may deny custom MIME reads during dragover. Use the active payload.
  }
  // WebView2 can hide custom MIME payloads during dragover/drop. The source
  // card keeps the structured payload in memory for that case.
  if (!raw) return activeAttachmentDrag ?? readAttachmentDragFromDom();

  try {
    const value = JSON.parse(raw) as Partial<AttachmentDragPayload>;
    if (typeof value.attachmentId !== "string" || !value.attachmentId.trim()) return activeAttachmentDrag ?? readAttachmentDragFromDom();
    const payload = {
      attachmentId: value.attachmentId,
      mimeType: typeof value.mimeType === "string" ? value.mimeType : null,
      originalName: typeof value.originalName === "string" ? value.originalName : "attachment",
    };
    return payload;
  } catch {
    return activeAttachmentDrag ?? readAttachmentDragFromDom();
  }
}

export function hasAttachmentDrag(dataTransfer: DataTransfer | null): boolean {
  return activeAttachmentDrag !== null || readAttachmentDragFromDom() !== null || Array.from(dataTransfer?.types ?? []).includes(ATTACHMENT_DRAG_MIME);
}
