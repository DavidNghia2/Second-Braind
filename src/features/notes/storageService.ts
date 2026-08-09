import { open } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { attachmentRepository, storageRepository } from "./noteRepository";
import type { Attachment, EditorSettings, StorageLocation } from "./types";

type StorageStatus = {
  root: string;
  accessible: boolean;
  attachments_dir: string;
  exports_dir: string;
  backups_dir: string;
  trash_dir: string;
};

type ImportedAttachment = {
  id: string;
  original_name: string;
  stored_name: string | null;
  mime_type: string | null;
  size_bytes: number;
  storage_mode: "managed" | "linked";
  relative_path: string | null;
  external_path: string | null;
};

type ImportKind = "image" | "attachment";

const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontFamily: "system",
  fontSize: 16,
  lineHeight: 1.7,
  contentWidth: 780,
};

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const ATTACHMENT_EXTENSIONS = [...IMAGE_EXTENSIONS, "bmp", "pdf", "txt", "doc", "docx", "xls", "xlsx", "zip"];
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

let settingsPromise: ReturnType<typeof load> | null = null;
const settings = () => {
  settingsPromise ??= load("settings.json", { defaults: { import_mode: "managed", editor_font_family: DEFAULT_EDITOR_SETTINGS.fontFamily, editor_font_size: DEFAULT_EDITOR_SETTINGS.fontSize, editor_line_height: DEFAULT_EDITOR_SETTINGS.lineHeight, editor_content_width: DEFAULT_EDITOR_SETTINGS.contentWidth }, autoSave: 300 });
  return settingsPromise;
};

export const storageService = {
  async getRoot(): Promise<string | null> {
    const value = await (await settings()).get<string>("storage_root");
    return value ?? null;
  },

  async getImportMode(): Promise<"managed" | "linked"> {
    const value = await (await settings()).get<"managed" | "linked">("import_mode");
    return value ?? "managed";
  },

  async setImportMode(mode: "managed" | "linked") {
    await (await settings()).set("import_mode", mode);
  },

  async getEditorSettings(): Promise<EditorSettings> {
    const store = await settings();
    const fontSize = (await store.get<number>("editor_font_size")) ?? DEFAULT_EDITOR_SETTINGS.fontSize;
    const lineHeight = (await store.get<number>("editor_line_height")) ?? DEFAULT_EDITOR_SETTINGS.lineHeight;
    const contentWidth = (await store.get<number>("editor_content_width")) ?? DEFAULT_EDITOR_SETTINGS.contentWidth;
    return {
      fontFamily: (await store.get<string>("editor_font_family")) ?? DEFAULT_EDITOR_SETTINGS.fontFamily,
      fontSize: Math.min(24, Math.max(13, fontSize)),
      lineHeight: Math.min(2.2, Math.max(1.3, lineHeight)),
      contentWidth: Math.min(1100, Math.max(620, contentWidth)),
    };
  },

  async setEditorSettings(value: EditorSettings) {
    const store = await settings();
    await store.set("editor_font_family", value.fontFamily);
    await store.set("editor_font_size", value.fontSize);
    await store.set("editor_line_height", value.lineHeight);
    await store.set("editor_content_width", value.contentWidth);
  },

  async getStatus(): Promise<StorageStatus | null> {
    const root = await this.getRoot();
    if (!root) return null;
    try {
      return await invoke<StorageStatus>("validate_storage", { root });
    } catch {
      return { root, accessible: false, attachments_dir: "", exports_dir: "", backups_dir: "", trash_dir: "" };
    }
  },

  async chooseRoot(): Promise<StorageStatus | null> {
    const selected = await open({ directory: true, multiple: false, title: "Choose Second Brain storage folder" });
    if (!selected || Array.isArray(selected)) return null;
    const status = await invoke<StorageStatus>("validate_storage", { root: selected });
    const location = await storageRepository.ensureLocation(status.root);
    await (await settings()).set("storage_root", status.root);
    await (await settings()).set("storage_location_id", location.id);
    return status;
  },

  async locations(): Promise<StorageLocation[]> {
    return storageRepository.listLocations();
  },

  async importForNote(noteId: string, kind: ImportKind = "attachment"): Promise<Attachment | null> {
    const root = await this.getRoot();
    if (!root) throw new Error("Choose a storage folder before adding attachments");
    const mode = await this.getImportMode();
    const selected = await open({
      multiple: false,
      title: kind === "image" ? "Insert image" : mode === "managed" ? "Add file to Second Brain" : "Link an external file",
      filters: [{ name: kind === "image" ? "Images" : "Supported files", extensions: kind === "image" ? IMAGE_EXTENSIONS : ATTACHMENT_EXTENSIONS }],
    });
    if (!selected || Array.isArray(selected)) return null;
    return this.importPathForNote(noteId, selected, mode);
  },

  async importPathForNote(noteId: string, sourcePath: string, storageMode?: "managed" | "linked"): Promise<Attachment> {
    const root = await this.getRoot();
    if (!root) throw new Error("Choose a storage folder before adding attachments");
    const mode = storageMode ?? await this.getImportMode();
    const imported = await invoke<ImportedAttachment>("import_attachment", { root, noteId, sourcePath, storageMode: mode });
    return this.persistImported(imported, root, mode, noteId);
  },

  async importBytesForNote(noteId: string, fileName: string, mimeType: string, bytes: Uint8Array): Promise<Attachment> {
    if (bytes.byteLength > MAX_IMPORT_BYTES) throw new Error("The selected file is too large (maximum 25 MB)");
    const root = await this.getRoot();
    if (!root) throw new Error("Choose a storage folder before adding attachments");
    if (!mimeType.toLowerCase().startsWith("image/")) throw new Error("Only images can be pasted into the editor");
    const imported = await invoke<ImportedAttachment>("import_attachment_bytes", { root, noteId, fileName, mimeType, bytes: Array.from(bytes) });
    return this.persistImported(imported, root, "managed", noteId);
  },

  async persistImported(imported: ImportedAttachment, root: string, mode: "managed" | "linked", noteId: string): Promise<Attachment> {
    const location = mode === "managed" ? await storageRepository.ensureLocation(root) : null;
    return attachmentRepository.add({
      id: imported.id,
      note_id: noteId,
      storage_location_id: location?.id ?? null,
      original_name: imported.original_name,
      stored_name: imported.stored_name,
      mime_type: imported.mime_type,
      size_bytes: imported.size_bytes,
      storage_mode: imported.storage_mode,
      relative_path: imported.relative_path,
      external_path: imported.external_path,
      display_mode: imported.mime_type === "pdf" ? "card" : "preview",
      caption: null,
      width_mode: "medium",
    });
  },

  async resolve(attachment: Attachment): Promise<string> {
    if (attachment.storage_mode === "linked") {
      if (!attachment.external_path) throw new Error("External file link is missing");
      return invoke<string>("register_linked_asset", { path: attachment.external_path });
    }
    if (!attachment.relative_path || !attachment.storage_location_id) throw new Error("Managed attachment path is missing");
    const location = (await this.locations()).find((item) => item.id === attachment.storage_location_id);
    if (!location) throw new Error("Storage location for attachment is missing");
    return invoke<string>("resolve_managed_attachment", { root: location.path, relativePathValue: attachment.relative_path });
  },

  async isAvailable(attachment: Attachment): Promise<boolean> {
    try {
      const path = await this.resolve(attachment);
      return await invoke<boolean>("attachment_exists", { path });
    } catch {
      return false;
    }
  },

  async assetUrl(attachment: Attachment): Promise<string> {
    return convertFileSrc(await this.resolve(attachment));
  },

  async open(attachment: Attachment) {
    await invoke("open_attachment_file", { path: await this.resolve(attachment) });
  },

  async openRoot(root: string) {
    await openPath(root);
  },

  async openUrl(url: string) {
    await openUrl(url);
  },

  async reveal(attachment: Attachment) {
    await invoke("reveal_attachment_file", { path: await this.resolve(attachment) });
  },

  async unlink(noteId: string, attachment: Attachment) {
    const orphan = await attachmentRepository.unlinkFromNote(noteId, attachment.id);
    if (orphan) await this.removePhysical(orphan);
  },

  async removePhysical(attachment: Attachment) {
    if (attachment.storage_mode === "managed" && attachment.relative_path && attachment.storage_location_id) {
      const location = (await this.locations()).find((item) => item.id === attachment.storage_location_id);
      if (!location) throw new Error("Storage location for attachment is missing");
      await invoke("remove_managed_attachment", { root: location.path, relativePathValue: attachment.relative_path });
    }
  },
};
