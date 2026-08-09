import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  Maximize2,
  MoreHorizontal,
  Play,
  RotateCcw,
  Ruler,
  TriangleAlert,
  X,
} from "lucide-react";
import { storageService } from "./storageService";
import type { Attachment, LinkPreview } from "./types";

type Language = "vi" | "en";
type AttachmentPatch = Pick<Attachment, "display_mode" | "caption" | "width_mode">;

export type MarkdownBlockActions = {
  language: Language;
  onAttachmentUpdate?: (attachment: Attachment, patch: AttachmentPatch) => Promise<void>;
  onAttachmentRemove?: (attachment: Attachment) => Promise<void>;
  onAttachmentReplace?: (attachment: Attachment) => Promise<void>;
  onLinkModeChange?: (preview: LinkPreview, mode: LinkPreview["display_mode"]) => Promise<void>;
};

const safeExternalUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const youtubeId = (value: string) => {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] || null;
    }
  } catch {
    return null;
  }
  return null;
};

const fileLabel = (attachment: Attachment, language: Language) => {
  const available = attachment.storage_mode === "linked" ? Boolean(attachment.external_path) : Boolean(attachment.relative_path);
  return available ? (language === "vi" ? "Có sẵn" : "Available") : (language === "vi" ? "Thiếu file" : "Missing");
};

function AttachmentMenu({ attachment, actions }: { attachment: Attachment; actions: MarkdownBlockActions }) {
  const vi = actions.language === "vi";
  const update = async (patch: AttachmentPatch) => actions.onAttachmentUpdate?.(attachment, patch);
  const isPdf = attachment.mime_type?.toLowerCase() === "pdf" || attachment.original_name.toLowerCase().endsWith(".pdf");
  const isImage = attachment.mime_type?.toLowerCase().startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(attachment.original_name);
  return <details className="block-menu">
    <summary className="icon-button small" title={vi ? "Thao tác tệp" : "File actions"} aria-label={vi ? "Thao tác tệp" : "File actions"}><MoreHorizontal size={16} /></summary>
    <div className="menu-popover">
      <button onClick={() => void storageService.open(attachment)}><ExternalLink size={14} />{vi ? "Mở file" : "Open file"}</button>
      <button onClick={() => void storageService.reveal(attachment)}><FolderOpen size={14} />{vi ? "Hiện trong Explorer" : "Show in Explorer"}</button>
      {isPdf && (["compact", "card", "preview"] as const).map((mode) => <button key={mode} onClick={() => void update({ ...attachment, display_mode: mode })}><Ruler size={14} />{vi ? `PDF: ${mode}` : `PDF: ${mode}`}</button>)}
      {isImage && actions.onAttachmentReplace && <button onClick={() => void actions.onAttachmentReplace?.(attachment)}><RotateCcw size={14} />{vi ? "Thay ảnh" : "Replace image"}</button>}
      {isImage && <button onClick={() => void update({ ...attachment, caption: window.prompt(vi ? "Chú thích ảnh" : "Image caption", attachment.caption ?? "") })}><Ruler size={14} />{vi ? "Đổi chú thích" : "Set caption"}</button>}
      {actions.onAttachmentRemove && <button className="danger-text" onClick={() => void actions.onAttachmentRemove?.(attachment)}><X size={14} />{vi ? "Gỡ khỏi ghi chú" : "Remove from note"}</button>}
    </div>
  </details>;
}

export function InlineAttachmentImage({ attachment, actions }: { attachment: Attachment; actions: MarkdownBlockActions }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const vi = actions.language === "vi";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMissing(false);
    void storageService.assetUrl(attachment).then((url) => {
      if (alive) setSrc(url);
    }).catch(() => {
      if (alive) setMissing(true);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [attachment]);

  const width = attachment.width_mode || "medium";
  return <figure className={`inline-attachment width-${width}`}>
    <div className="inline-attachment-header"><span><ImageIcon size={14} />{attachment.original_name}</span><AttachmentMenu attachment={attachment} actions={actions} /></div>
    <div className="inline-image-frame">
      {loading && <div className="image-loading"><span className="loading-spinner" />{vi ? "Đang tải ảnh..." : "Loading image..."}</div>}
      {!loading && missing && <div className="image-missing"><TriangleAlert size={21} /><strong>{vi ? "Không tìm thấy file" : "File not found"}</strong><span>{vi ? "Ảnh có thể đã bị di chuyển hoặc xóa." : "The image may have been moved or deleted."}</span></div>}
      {!loading && !missing && src && <img src={src} alt={attachment.caption || attachment.original_name} onError={() => setMissing(true)} />}
      {!loading && !missing && !src && <div className="image-missing"><TriangleAlert size={21} /><span>{vi ? "Không thể hiển thị ảnh" : "Unable to display image"}</span></div>}
    </div>
    {attachment.caption && <figcaption>{attachment.caption}</figcaption>}
    <div className="inline-image-tools">
      {(["small", "medium", "large", "full"] as const).map((value) => <button className={width === value ? "active" : ""} key={value} title={value} aria-label={value} onClick={() => void actions.onAttachmentUpdate?.(attachment, { ...attachment, width_mode: value })}>{value === "full" ? <Maximize2 size={13} /> : <span>{value[0].toUpperCase()}</span>}</button>)}
    </div>
  </figure>;
}

export function AttachmentBlock({ attachment, actions }: { attachment: Attachment; actions: MarkdownBlockActions }) {
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const vi = actions.language === "vi";
  const isPreview = attachment.display_mode === "preview" && attachment.mime_type === "pdf";

  useEffect(() => {
    let alive = true;
    void storageService.assetUrl(attachment).then((url) => { if (alive) setSrc(url); }).catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; };
  }, [attachment]);

  return <article className={`attachment-block mode-${attachment.display_mode}`}>
    <div className="attachment-block-icon"><FileText size={21} /></div>
    <div className="attachment-block-info"><strong title={attachment.original_name}>{attachment.original_name}</strong><div><span>{attachment.mime_type?.toUpperCase() || "FILE"}</span><span>{(attachment.size_bytes / 1024 / 1024).toFixed(1)} MB</span><span className={missing ? "missing" : "available"}>{missing ? <TriangleAlert size={11} /> : <CheckCircle2 size={11} />}{missing ? (vi ? "Thiếu file" : "Missing") : fileLabel(attachment, actions.language)}</span></div></div>
    <div className="attachment-block-actions"><button className="icon-button small" title={vi ? "Mở file" : "Open file"} aria-label={vi ? "Mở file" : "Open file"} disabled={missing} onClick={() => void storageService.open(attachment)}><ExternalLink size={15} /></button><AttachmentMenu attachment={attachment} actions={actions} /></div>
    {isPreview && src && !missing && <iframe className="pdf-preview" title={attachment.original_name} src={src} />}
    {attachment.display_mode === "compact" && <button className="compact-file-link" onClick={() => void storageService.open(attachment)}><Link2 size={14} />{vi ? "Mở tệp" : "Open file"}</button>}
  </article>;
}

export function LinkPreviewBlock({ preview, actions }: { preview: LinkPreview; actions: MarkdownBlockActions }) {
  const vi = actions.language === "vi";
  const external = safeExternalUrl(preview.url);
  const video = preview.provider === "youtube" ? youtubeId(preview.url) : null;
  const [playing, setPlaying] = useState(false);
  const title = preview.title || (preview.provider === "github" ? preview.url.replace(/^https?:\/\/github\.com\//, "") : preview.site_name || preview.url);
  const host = (() => { try { return new URL(preview.url).hostname.replace(/^www\./, ""); } catch { return "link"; } })();
  const mode = preview.display_mode;

  if (mode === "link") return <a className="smart-link" href={external ?? "#"} onClick={(event) => { event.preventDefault(); if (external) void storageService.openUrl(external); }} title={vi ? "Mở liên kết bên ngoài ứng dụng" : "Open link outside the app"}><Link2 size={14} /><span>{title}</span><ExternalLink size={13} /></a>;
  return <article className={`link-preview-card provider-${preview.provider}`}>
    {video && <div className="youtube-thumbnail" style={{ backgroundImage: `url(https://img.youtube.com/vi/${video}/hqdefault.jpg)` }}>{playing ? <iframe title={title} src={`https://www.youtube-nocookie.com/embed/${video}?autoplay=1`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <button title={vi ? "Phát video" : "Play video"} aria-label={vi ? "Phát video" : "Play video"} onClick={() => setPlaying(true)}><Play size={22} fill="currentColor" /></button>}</div>}
    <div className="link-preview-content"><div className="link-preview-top"><span className="link-provider">{preview.provider === "youtube" ? "YouTube" : preview.provider === "github" ? "GitHub" : host}</span><details className="block-menu"><summary className="icon-button small" title={vi ? "Kiểu hiển thị" : "Display mode"} aria-label={vi ? "Kiểu hiển thị" : "Display mode"}><MoreHorizontal size={15} /></summary><div className="menu-popover"><button onClick={() => void actions.onLinkModeChange?.(preview, "card")}><Ruler size={14} />{vi ? "Hiển thị dạng thẻ" : "Display as card"}</button>{video && <button onClick={() => void actions.onLinkModeChange?.(preview, "embed")}><Play size={14} />{vi ? "Nhúng sau khi phát" : "Embed on play"}</button>}<button onClick={() => void actions.onLinkModeChange?.(preview, "link")}><Link2 size={14} />{vi ? "Liên kết thường" : "Normal link"}</button></div></details></div><strong>{title}</strong>{preview.description && <p>{preview.description}</p>}<div className="link-preview-footer"><span>{host}</span>{external && <button onClick={() => void storageService.openUrl(external)} title={vi ? "Mở ngoài ứng dụng" : "Open outside the app"}><ExternalLink size={13} />{vi ? "Mở liên kết" : "Open link"}</button>}</div></div>
  </article>;
}

export function MissingAttachmentToken({ label, language }: { label: string; language: Language }) {
  return <span className="missing-token"><TriangleAlert size={14} />{label || (language === "vi" ? "File đính kèm không tồn tại" : "Attachment not found")}</span>;
}
