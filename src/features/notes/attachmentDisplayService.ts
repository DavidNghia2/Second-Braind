import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { noteService } from "./noteService";
import { storageService } from "./storageService";
import type { Attachment } from "./types";

export type AttachmentDisplayResult =
  | { status: "available"; attachment: Attachment; url: string }
  | { status: "missing"; attachment: Attachment | null; reason: string };

export const attachmentDisplayService = {
  async resolveAttachmentDisplayUrl(attachmentId: string): Promise<AttachmentDisplayResult> {
    const attachment = await noteService.getAttachment(attachmentId);
    if (!attachment) return { status: "missing", attachment: null, reason: "Attachment record not found" };
    try {
      const path = await storageService.resolve(attachment);
      const exists = await invoke<boolean>("attachment_exists", { path });
      if (!exists) return { status: "missing", attachment, reason: "File not found" };
      return { status: "available", attachment, url: convertFileSrc(path) };
    } catch (cause: unknown) {
      return { status: "missing", attachment, reason: cause instanceof Error ? cause.message : String(cause) };
    }
  },
};
