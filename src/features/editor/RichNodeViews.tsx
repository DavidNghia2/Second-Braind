import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { CheckCircle2, ExternalLink, FileText, FolderOpen, ImageOff, Link2, MoreHorizontal, Play, TriangleAlert, X } from "lucide-react";
import { attachmentDisplayService, type AttachmentDisplayResult } from "../notes/attachmentDisplayService";
import { storageService } from "../notes/storageService";
import type { Attachment, LinkPreview } from "../notes/types";
import { imageBubbleMenuPluginKey, imageOverlayId, overlayStore, useActiveOverlay } from "./overlayStore";

export type RichTextActions = {
  language: () => "vi" | "en";
  findLink: (url: string) => LinkPreview | undefined;
  onAttachmentUpdate: (attachment: Attachment, patch: Pick<Attachment, "display_mode" | "caption" | "width_mode">) => Promise<void>;
  onAttachmentRemove: (attachment: Attachment) => Promise<void>;
  onAttachmentReplace: (attachment: Attachment) => Promise<void>;
  onLinkModeChange: (preview: LinkPreview, mode: LinkPreview["display_mode"]) => Promise<void>;
  getActiveOverlay?: () => string | null;
  setActiveOverlay?: (id: string | null) => void;
};

const useAttachment = (id: string) => {
  const [result, setResult] = useState<AttachmentDisplayResult | null>(null);
  const refresh = () => void attachmentDisplayService.resolveAttachmentDisplayUrl(id).then(setResult);
  useEffect(() => { let active = true; setResult(null); void attachmentDisplayService.resolveAttachmentDisplayUrl(id).then((value) => { if (active) setResult(value); }); return () => { active = false; }; }, [id]);
  return { result, refresh };
};

function ImageNodeView({ node, selected, updateAttributes, deleteNode, editor, extension, getPos }: NodeViewProps) {
  const actions = extension.options.actions as RichTextActions;
  const id = String(node.attrs.attachmentId || "");
  const { result, refresh } = useAttachment(id);
  const wrapper = useRef<HTMLDivElement>(null);
  const [draftWidth, setDraftWidth] = useState(Number(node.attrs.width) || 560);
  const vi = actions.language() === "vi";
  const attachment = result?.attachment ?? null;
  const close = () => overlayStore.set(null);
  useEffect(() => setDraftWidth(Number(node.attrs.width) || 560), [node.attrs.width]);
  const resize = (event: React.PointerEvent) => {
    if (!editor.isEditable) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX; const startWidth = draftWidth; let finalWidth = startWidth;
    const move = (moveEvent: PointerEvent) => { const max = wrapper.current?.parentElement?.clientWidth ?? 1100; finalWidth = Math.round(Math.min(max, Math.max(160, startWidth + moveEvent.clientX - startX))); setDraftWidth(finalWidth); };
    const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); updateAttributes({ width: finalWidth }); };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up, { once: true });
  };
  const remove = async () => { if (!attachment || !window.confirm(vi ? `Gỡ “${attachment.original_name}” khỏi ghi chú?` : `Remove “${attachment.original_name}” from this note?`)) return; deleteNode(); close(); await actions.onAttachmentRemove(attachment); };
  const replace = async () => { if (attachment) { await actions.onAttachmentReplace(attachment); refresh(); } close(); };
  const alignStyle = node.attrs.alignment === "left" ? { marginLeft: 0, marginRight: "auto" } : node.attrs.alignment === "right" ? { marginLeft: "auto", marginRight: 0 } : { marginLeft: "auto", marginRight: "auto" };
  const openImageMenu = (event: React.MouseEvent) => {
    if (!editor.isEditable) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, .image-resize-handle")) return;
    const position = typeof getPos === "function" ? getPos() : null;
    if (typeof position !== "number") return;
    const currentNode = editor.state.doc.nodeAt(position);
    if (!currentNode || currentNode.type.name !== "managedImage" || String(currentNode.attrs.attachmentId || "") !== id) return;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)));
    editor.commands.focus();
    // Wait for the selection transaction to be observed before showing the menu.
    requestAnimationFrame(() => {
      const selection = editor.state.selection;
      if (selection instanceof NodeSelection
        && selection.node.type.name === "managedImage"
        && selection.from === position
        && String(selection.node.attrs.attachmentId || "") === id) {
        overlayStore.set(imageOverlayId(id, position));
        editor.view.dispatch(editor.state.tr.setMeta(imageBubbleMenuPluginKey, "show"));
        requestAnimationFrame(() => editor.view.dispatch(editor.state.tr.setMeta(imageBubbleMenuPluginKey, "updatePosition")));
      }
    });
  };
  const selectImage = (event: React.PointerEvent) => {
    if (!editor.isEditable) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, .image-resize-handle")) return;
    // Select on pointer-down so a double-click does not briefly run two
    // competing click handlers before the popup opens.
    event.stopPropagation();
    const position = typeof getPos === "function" ? getPos() : null;
    if (typeof position !== "number") return;
    // A normal click only selects the node. The popup is opened exclusively
    // by the real double-click handler below.
    editor.commands.setNodeSelection(position);
    editor.commands.focus();
  };
  return <NodeViewWrapper ref={wrapper} className={`rich-image-node ${selected ? "is-selected" : ""}`} style={{ width: `${draftWidth}px`, ...alignStyle }} data-drag-handle data-overlay-root data-attachment-id={id} title={editor.isEditable ? (vi ? "Nhấp đúp để chỉnh ảnh" : "Double-click to edit image") : undefined} onPointerDown={selectImage} onDoubleClick={openImageMenu}>
    {result === null && <div className="rich-node-loading"><span className="loading-spinner" />{vi ? "Đang tải ảnh…" : "Loading image…"}</div>}
    {result?.status === "available" && <img src={result.url} alt={String(node.attrs.alt || attachment?.original_name || "Image")} draggable={false} />}
    {result?.status === "missing" && <div className="rich-image-missing"><ImageOff size={26} /><strong>{vi ? "Không tìm thấy ảnh" : "Image not found"}</strong><span>{result.reason}</span>{attachment && editor.isEditable && <div><button onClick={() => void replace()}><FolderOpen size={14} />{vi ? "Định vị/Thay ảnh" : "Locate/Replace"}</button><button onClick={() => void remove()}><X size={14} />{vi ? "Gỡ khỏi ghi chú" : "Remove"}</button></div>}</div>}
    {node.attrs.caption && <figcaption>{node.attrs.caption}</figcaption>}
    {editor.isEditable && selected && <button className="image-resize-handle" data-overlay-root title={vi ? "Kéo để đổi kích thước" : "Drag to resize"} aria-label={vi ? "Đổi kích thước ảnh" : "Resize image"} onPointerDown={resize} />}
  </NodeViewWrapper>;
}

function AttachmentNodeView({ node, selected, updateAttributes, deleteNode, editor, extension }: NodeViewProps) {
  const actions = extension.options.actions as RichTextActions; const { result } = useAttachment(String(node.attrs.attachmentId || "")); const vi = actions.language() === "vi"; const attachment = result?.attachment ?? null; const mode = String(node.attrs.displayMode || attachment?.display_mode || "card"); const missing = result?.status === "missing"; const overlayId = `attachment:${node.attrs.attachmentId}`; const activeOverlay = useActiveOverlay(); const open = activeOverlay === overlayId; const close = () => overlayStore.set(null);
  const setMode = (value: "compact" | "card" | "preview") => { updateAttributes({ displayMode: value }); if (attachment) void actions.onAttachmentUpdate(attachment, { display_mode: value, caption: attachment.caption, width_mode: attachment.width_mode }); close(); };
  const remove = async () => { if (!attachment || !window.confirm(vi ? `Gỡ “${attachment.original_name}” khỏi ghi chú?` : `Remove “${attachment.original_name}" from this note?`)) return; deleteNode(); close(); await actions.onAttachmentRemove(attachment); };
  return <NodeViewWrapper className={`rich-attachment-node mode-${mode} ${selected ? "is-selected" : ""}`} data-drag-handle><div className="attachment-block-icon"><FileText size={21} /></div><div className="attachment-block-info"><strong>{attachment?.original_name || (vi ? "File không tồn tại" : "Missing attachment")}</strong><div>{attachment && <><span>{attachment.mime_type?.toUpperCase() || "FILE"}</span><span>{(attachment.size_bytes / 1024 / 1024).toFixed(1)} MB</span><span>{attachment.storage_mode === "managed" ? "Managed" : "Linked"}</span></>}<span className={missing ? "missing" : "available"}>{missing ? <TriangleAlert size={12} /> : <CheckCircle2 size={12} />}{missing ? (vi ? "Thiếu file" : "Missing") : (vi ? "Sẵn sàng" : "Available")}</span></div></div><div className="attachment-block-actions">{attachment && <button disabled={missing} onClick={() => void storageService.open(attachment)}><ExternalLink size={15} /></button>}{editor.isEditable && selected && <div className="overlay-anchor" data-overlay-root onPointerDown={(event) => event.stopPropagation()}><button onClick={() => actions.setActiveOverlay?.(open ? null : overlayId)}><MoreHorizontal size={16} /></button>{open && <div className="menu-popover"><button onClick={() => setMode("compact")}>Compact</button><button onClick={() => setMode("card")}>Card</button><button onClick={() => setMode("preview")}>Preview</button>{attachment && <><button disabled={missing} onClick={() => void storageService.open(attachment)}>Open file</button><button disabled={missing} onClick={() => { void storageService.reveal(attachment); close(); }}>Explorer</button><button className="danger-text" onClick={() => void remove()}><X size={14} />{vi ? "Gỡ" : "Remove"}</button></>}</div>}</div>}</div>{mode === "preview" && result?.status === "available" && attachment?.original_name.toLowerCase().endsWith(".pdf") && <iframe className="pdf-preview" title={attachment.original_name} src={result.url} />}</NodeViewWrapper>;
}

const safeUrl = (value: string) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.toString() : null; } catch { return null; } };
const youtubeId = (value: string) => { try { const url = new URL(value); if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0] || null; if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) return url.pathname === "/watch" ? url.searchParams.get("v") : (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) ? url.pathname.split("/")[2] || null : null; } catch { return null; } return null; };

function SmartLinkNodeView({ node, selected, updateAttributes, deleteNode, editor, extension }: NodeViewProps) {
  const activeOverlay = useActiveOverlay();
  const actions = extension.options.actions as RichTextActions; const url = String(node.attrs.url || ""); const preview = actions.findLink(url); const external = safeUrl(url); const video = String(node.attrs.provider) === "youtube" ? youtubeId(url) : null; const [playing, setPlaying] = useState(false); const vi = actions.language() === "vi"; const mode = String(node.attrs.displayMode || preview?.display_mode || "card"); const title = String(node.attrs.title || preview?.title || url); const overlayId = `link:${url}`; const open = activeOverlay === overlayId; const close = () => overlayStore.set(null); const setMode = (value: LinkPreview["display_mode"]) => { updateAttributes({ displayMode: value }); if (preview) void actions.onLinkModeChange(preview, value); close(); };
  if (mode === "link") return <NodeViewWrapper className={`rich-smart-link ${selected ? "is-selected" : ""}`}><button onClick={() => external && void storageService.openUrl(external)}><Link2 size={14} />{title}<ExternalLink size={13} /></button></NodeViewWrapper>;
  return <NodeViewWrapper className={`rich-link-card provider-${node.attrs.provider} ${selected ? "is-selected" : ""}`} data-drag-handle>{video && <div className="youtube-thumbnail" style={{ backgroundImage: `url(https://img.youtube.com/vi/${video}/hqdefault.jpg)` }}>{playing ? <iframe title={title} src={`https://www.youtube-nocookie.com/embed/${video}?autoplay=1`} allowFullScreen /> : <button onClick={() => setPlaying(true)}><Play size={24} /></button>}</div>}<div className="link-preview-content"><span className="link-provider">{String(node.attrs.provider || "link")}</span><strong>{title}</strong>{preview?.description && <p>{preview.description}</p>}<div className="link-preview-footer"><span>{external ? new URL(external).hostname.replace(/^www\./, "") : "link"}</span>{external && <button onClick={() => void storageService.openUrl(external)}><ExternalLink size={13} />{vi ? "Mở liên kết" : "Open link"}</button>}</div></div>{editor.isEditable && selected && <div className="rich-link-menu overlay-anchor" data-overlay-root onPointerDown={(event) => event.stopPropagation()}><button onClick={() => actions.setActiveOverlay?.(open ? null : overlayId)}><MoreHorizontal size={16} /></button>{open && <div className="menu-popover"><button onClick={() => setMode("card")}>Card</button>{video && <button onClick={() => setMode("embed")}>Embed</button>}<button onClick={() => setMode("link")}>{vi ? "Liên kết thường" : "Normal link"}</button><button className="danger-text" onClick={() => { deleteNode(); close(); }}><X size={14} />{vi ? "Gỡ thẻ" : "Remove card"}</button></div>}</div>}</NodeViewWrapper>;
}

export function createRichNodes(actions: RichTextActions) {
  const managedImage = Node.create({ name: "managedImage", group: "block", atom: true, draggable: true, selectable: true, addOptions: () => ({ actions }), addAttributes: () => ({ attachmentId: { default: null }, width: { default: 560 }, alignment: { default: "center" }, caption: { default: "" }, alt: { default: "" } }), parseHTML: () => [{ tag: "figure[data-managed-image]" }], renderHTML: ({ HTMLAttributes }) => ["figure", mergeAttributes(HTMLAttributes, { "data-managed-image": "" })], addNodeView() { return ReactNodeViewRenderer(ImageNodeView); } });
  const attachmentBlock = Node.create({ name: "attachmentBlock", group: "block", atom: true, draggable: true, selectable: true, addOptions: () => ({ actions }), addAttributes: () => ({ attachmentId: { default: null }, displayMode: { default: "card" } }), parseHTML: () => [{ tag: "div[data-attachment-block]" }], renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-attachment-block": "" })], addNodeView() { return ReactNodeViewRenderer(AttachmentNodeView); } });
  const smartLink = Node.create({ name: "smartLink", group: "block", atom: true, draggable: true, selectable: true, addOptions: () => ({ actions }), addAttributes: () => ({ url: { default: "" }, provider: { default: "generic" }, displayMode: { default: "card" }, title: { default: "" } }), parseHTML: () => [{ tag: "div[data-smart-link]" }], renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-smart-link": "" })], addNodeView() { return ReactNodeViewRenderer(SmartLinkNodeView); } });
  return [managedImage, attachmentBlock, smartLink];
}
