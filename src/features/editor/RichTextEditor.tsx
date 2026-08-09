import { useEffect, useMemo, useRef, type DragEvent as ReactDragEvent } from "react";
import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { dropPoint } from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { ExternalLink, FolderOpen, MoreHorizontal, RotateCcw, X } from "lucide-react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { documentForNote } from "./document";
import { createRichNodes, type RichTextActions } from "./RichNodeViews";
import { storageService } from "../notes/storageService";
import type { Attachment, LinkPreview, Note } from "../notes/types";
import { imageBubbleMenuPluginKey, imageOverlayId, overlayStore, parseImageOverlay, useActiveOverlay } from "./overlayStore";
import { endAttachmentDrag, hasAttachmentDrag, readAttachmentDrag, type AttachmentDragPayload } from "./attachmentDrag";

const attachmentDropIndicatorKey = new PluginKey<number | null>("attachmentDropIndicator");

const AttachmentDropIndicator = Extension.create({
  name: "attachmentDropIndicator",
  addProseMirrorPlugins() {
    return [new Plugin<number | null>({
      key: attachmentDropIndicatorKey,
      state: {
        init: () => null,
        apply: (transaction, current) => {
          const next = transaction.getMeta(attachmentDropIndicatorKey) as number | null | undefined;
          return next === undefined ? current : next;
        },
      },
      props: {
        decorations: (state) => {
          const position = attachmentDropIndicatorKey.getState(state);
          if (position === null || position === undefined) return DecorationSet.empty;
          return DecorationSet.create(state.doc, [Decoration.widget(position, () => {
            const marker = document.createElement("span");
            marker.className = "attachment-drop-indicator";
            marker.setAttribute("aria-hidden", "true");
            return marker;
          }, { side: -1 })]);
        },
      },
    })];
  },
});

const baseExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
  Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { rel: "noopener noreferrer" } }),
  Underline,
  TextStyle,
  FontFamily,
  FontSize,
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: "Bắt đầu viết..." }),
  AttachmentDropIndicator,
];

type EditorActions = Omit<RichTextActions, "language" | "findLink">;

function imageWrapperForPosition(editor: Editor, position: number, attachmentId: string): HTMLElement | null {
  const dom = editor.view.nodeDOM(position);
  if (!(dom instanceof HTMLElement)) return null;
  const wrapper = dom.matches("[data-node-view-wrapper]")
    ? dom
    : dom.querySelector<HTMLElement>("[data-node-view-wrapper]");
  if (!wrapper || wrapper.dataset.attachmentId !== attachmentId) return null;
  return wrapper;
}

function ImageBubbleControls({ editor, language, attachments, actions }: { editor: Editor | null; language: "vi" | "en"; attachments: Attachment[]; actions: EditorActions }) {
  const activeOverlay = useActiveOverlay();
  const selection = editor?.state.selection;
  const selectedImage = selection instanceof NodeSelection && selection.node.type.name === "managedImage" ? selection.node : null;
  const attrs = selectedImage?.attrs ?? {};
  const position = selection instanceof NodeSelection && selectedImage ? selection.from : -1;
  const attachment = attachments.find((item) => item.id === attrs.attachmentId);
  const imageId = imageOverlayId(String(attrs.attachmentId || ""), position);
  const moreId = imageOverlayId(String(attrs.attachmentId || ""), position, true);
  const visible = Boolean(selectedImage) && (activeOverlay === imageId || activeOverlay === moreId);
  const attachmentId = String(attrs.attachmentId || "");
  const imageWrapper = editor && selectedImage && position >= 0 ? imageWrapperForPosition(editor, position, attachmentId) : null;
  useEffect(() => {
    if (!editor || !visible || !selectedImage || position < 0) return;
    const target = imageWrapperForPosition(editor, position, attachmentId);
    if (!target) return;
    const padding = 12;
    const rect = target.getBoundingClientRect();
    const partiallyVisible = rect.top < padding || rect.bottom > window.innerHeight - padding;
    if (!partiallyVisible) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const scrollTarget = editor.view.dom.closest<HTMLElement>(".editor-scroll") ?? window;
    const refreshPosition = () => {
      scrollTarget.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    };
    const frame = requestAnimationFrame(refreshPosition);
    const timer = window.setTimeout(refreshPosition, 450);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [visible, selectedImage, editor, position, attachmentId]);
  useEffect(() => {
    if (!editor || visible) return;
    editor.view.dispatch(editor.state.tr.setMeta(imageBubbleMenuPluginKey, "hide"));
  }, [editor, visible]);
  if (!editor) return null;
  const update = (patch: Record<string, unknown>) => { editor.chain().focus().updateAttributes("managedImage", patch).run(); overlayStore.set(null); };
  const vi = language === "vi";
  const referencedImage = imageWrapper ? {
    getBoundingClientRect: () => imageWrapper.getBoundingClientRect(),
    getClientRects: () => [imageWrapper.getBoundingClientRect()],
  } : null;
  const scrollTarget = editor.view.dom.closest<HTMLElement>(".editor-scroll") ?? window;
  return <BubbleMenu editor={editor} pluginKey={imageBubbleMenuPluginKey} appendTo={() => document.body} getReferencedVirtualElement={() => referencedImage} options={{ strategy: "fixed", placement: "top", offset: 10, flip: { padding: 12 }, shift: { padding: 12 }, scrollTarget }} data-overlay-root className="image-bubble-shell" shouldShow={({ state }) => visible && state.selection instanceof NodeSelection && state.selection.node.type.name === "managedImage" && String(state.selection.node.attrs.attachmentId || "") === attachmentId}>
    <div className="image-bubble-menu" data-overlay-root onPointerDown={(event) => event.stopPropagation()}>
      <button onClick={() => update({ width: 320 })}>Small</button><button onClick={() => update({ width: 560 })}>Medium</button><button onClick={() => update({ width: 760 })}>Large</button><button onClick={() => update({ width: 9999 })}>{vi ? "Toàn chiều rộng" : "Full width"}</button>
      <button onClick={() => update({ alignment: "left" })}>{vi ? "Trái" : "Left"}</button><button onClick={() => update({ alignment: "center" })}>{vi ? "Giữa" : "Center"}</button><button onClick={() => update({ alignment: "right" })}>{vi ? "Phải" : "Right"}</button>
      <button className="image-more-trigger" onClick={() => overlayStore.toggle(moreId)}><MoreHorizontal size={16} /></button>
      {activeOverlay === moreId && <div className="menu-popover image-more-popover"><button onClick={() => { const caption = window.prompt(vi ? "Chú thích ảnh" : "Image caption", String(attrs.caption || "")); if (caption !== null) { editor.chain().focus().updateAttributes("managedImage", { caption }).run(); if (attachment) void actions.onAttachmentUpdate(attachment, { display_mode: attachment.display_mode, caption, width_mode: attachment.width_mode }); } overlayStore.set(null); }}>{vi ? "Sửa chú thích" : "Edit caption"}</button>{attachment && <><button onClick={() => { void actions.onAttachmentReplace(attachment).finally(() => overlayStore.set(null)); }}><RotateCcw size={14} />{vi ? "Thay ảnh" : "Replace"}</button><button onClick={() => { void storageService.open(attachment); overlayStore.set(null); }}><ExternalLink size={14} />{vi ? "Mở file gốc" : "Open original"}</button><button onClick={() => { void storageService.reveal(attachment); overlayStore.set(null); }}><FolderOpen size={14} />{vi ? "Hiện trong Explorer" : "Show in Explorer"}</button><button className="danger-text" onClick={() => { editor.chain().focus().deleteSelection().run(); overlayStore.set(null); void actions.onAttachmentRemove(attachment); }}><X size={14} />{vi ? "Gỡ ảnh" : "Remove"}</button></>}</div>}
    </div>
  </BubbleMenu>;
}

export function RichTextEditor({ note, editable, language, attachments, linkPreviews, actions, onPasteImage, onUrlPaste, onDropFeedback, onDocumentChange, onReady }: {
  note: Note;
  editable: boolean;
  language: "vi" | "en";
  attachments: Attachment[];
  linkPreviews: LinkPreview[];
  actions: EditorActions;
  onPasteImage: (file: File) => Promise<Attachment | null>;
  onUrlPaste: (url: string) => void;
  onDropFeedback: (message: string) => void;
  onDocumentChange: (document: JSONContent) => void;
  onReady: (editor: Editor | null) => void;
}) {
  const changeRef = useRef(onDocumentChange);
  changeRef.current = onDocumentChange;
  const languageRef = useRef(language);
  languageRef.current = language;
  const linksRef = useRef(linkPreviews);
  linksRef.current = linkPreviews;
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const pasteImageRef = useRef(onPasteImage);
  pasteImageRef.current = onPasteImage;
  const urlPasteRef = useRef(onUrlPaste);
  urlPasteRef.current = onUrlPaste;
  const dropFeedbackRef = useRef(onDropFeedback);
  dropFeedbackRef.current = onDropFeedback;
  const initialContent = useMemo(() => documentForNote(note), []);
  const attachmentNodeForDrop = (view: EditorView, payload: AttachmentDragPayload): ProseMirrorNode | null => {
    const attachment = attachmentsRef.current.find((item) => item.id === payload.attachmentId);
    const name = attachment?.original_name ?? payload.originalName ?? "attachment";
    const mime = attachment?.mime_type ?? payload.mimeType ?? "";
    const image = mime.toLowerCase().startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
    const type = image ? view.state.schema.nodes.managedImage : view.state.schema.nodes.attachmentBlock;
    if (!type) return null;
    return type.create(image
      ? { attachmentId: payload.attachmentId, width: 560, alignment: "center", caption: attachment?.caption ?? "", alt: name }
      : { attachmentId: payload.attachmentId, displayMode: attachment?.display_mode ?? "card" });
  };
  const attachmentDropPosition = (view: EditorView, event: DragEvent, node: ProseMirrorNode) => {
    const slice = new Slice(Fragment.from(node), 0, 0);
    const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
    const documentEnd = view.state.doc.content.size;
    const requestedPosition = coordinates?.pos ?? documentEnd;
    return dropPoint(view.state.doc, requestedPosition, slice)
      ?? dropPoint(view.state.doc, documentEnd, slice)
      ?? documentEnd;
  };
  const insertAttachmentDrop = (view: EditorView, event: DragEvent) => {
    if (!hasAttachmentDrag(event.dataTransfer)) return false;
    const payload = readAttachmentDrag(event.dataTransfer);
    event.preventDefault();
    event.stopPropagation();
    view.dispatch(view.state.tr.setMeta(attachmentDropIndicatorKey, null).setMeta("addToHistory", false));
    try {
      if (!editableRef.current || !payload?.attachmentId) throw new Error(languageRef.current === "vi" ? "Không thể chèn file tại vị trí này" : "This file cannot be inserted here");
      const node = attachmentNodeForDrop(view, payload);
      if (!node) throw new Error(languageRef.current === "vi" ? "Editor không hỗ trợ loại file này" : "The editor does not support this file type");
      const position = attachmentDropPosition(view, event, node);
      view.dispatch(view.state.tr.insert(position, node).scrollIntoView());
      dropFeedbackRef.current(languageRef.current === "vi" ? "Đã chèn file vào ghi chú" : "Attachment inserted into the note");
    } catch (error: unknown) {
      dropFeedbackRef.current(error instanceof Error ? error.message : (languageRef.current === "vi" ? "Không thể chèn file" : "Could not insert attachment"));
    } finally {
      // Keep the fallback alive through the complete drop propagation so App's
      // outer OS-file handler can still recognize and ignore this internal drag.
      queueMicrotask(() => endAttachmentDrag(payload?.attachmentId));
    }
    return true;
  };
  const previewAttachmentDrop = (view: EditorView, event: DragEvent) => {
    const payload = readAttachmentDrag(event.dataTransfer);
    if (!payload || !editableRef.current) return false;
    event.preventDefault();
    event.dataTransfer!.dropEffect = "copy";
    const node = attachmentNodeForDrop(view, payload);
    const position = node ? attachmentDropPosition(view, event, node) : null;
    if (attachmentDropIndicatorKey.getState(view.state) !== position) {
      view.dispatch(view.state.tr.setMeta(attachmentDropIndicatorKey, position).setMeta("addToHistory", false));
    }
    return true;
  };
  const extensions = useMemo(() => [...baseExtensions, ...createRichNodes({
    language: () => languageRef.current,
    findLink: (url) => linksRef.current.find((item) => item.url === url),
    onAttachmentUpdate: (...args) => actionsRef.current.onAttachmentUpdate(...args),
    onAttachmentRemove: (...args) => actionsRef.current.onAttachmentRemove(...args),
    onAttachmentReplace: (...args) => actionsRef.current.onAttachmentReplace(...args),
    onLinkModeChange: (...args) => actionsRef.current.onLinkModeChange(...args),
    getActiveOverlay: overlayStore.get,
    setActiveOverlay: overlayStore.set,
  })], []);
  const editor = useEditor({
    extensions,
    content: initialContent,
    editable,
    editorProps: {
      attributes: { class: "visual-editor-content", spellcheck: "true" },
      handlePaste: (view, event) => {
        const image = Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"));
        if (image) {
          event.preventDefault();
          const position = view.state.selection.from;
          void pasteImageRef.current(image).then((attachment) => {
            if (!attachment) return;
            const node = view.state.schema.nodes.managedImage.create({ attachmentId: attachment.id, width: 560, alignment: "center", caption: attachment.caption ?? "", alt: attachment.original_name });
            view.dispatch(view.state.tr.insert(Math.min(position, view.state.doc.content.size), node));
          });
          return true;
        }
        const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
        if (/^https?:\/\/\S+$/i.test(text)) { event.preventDefault(); urlPasteRef.current(text); return true; }
        return false;
      },
      handleDOMEvents: {
        dragover: (view, event) => previewAttachmentDrop(view, event),
        dragleave: (view, event) => {
          if (event.relatedTarget instanceof globalThis.Node && view.dom.contains(event.relatedTarget)) return false;
          if (attachmentDropIndicatorKey.getState(view.state) !== null) {
            view.dispatch(view.state.tr.setMeta(attachmentDropIndicatorKey, null).setMeta("addToHistory", false));
          }
          return false;
        },
      },
      handleDrop: (view, event) => {
        return insertAttachmentDrop(view, event);
      },
      handleClick: (_view, _position, event) => {
        if (editableRef.current) {
          const target = event.target as HTMLElement | null;
          if (!target?.closest(".rich-image-node, [data-overlay-root]")) overlayStore.set(null);
          return false;
        }
        const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
        if (!anchor || !/^(?:https?:|mailto:)/i.test(anchor.href)) return false;
        event.preventDefault();
        void storageService.openUrl(anchor.href);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => changeRef.current(current.getJSON()),
  });

  useEffect(() => {
    if (!editor) return;
    overlayStore.set(null);
    editor.commands.setContent(documentForNote(note), { emitUpdate: false });
  }, [editor, note.id]);

  useEffect(() => { editor?.setEditable(editable, false); }, [editable, editor]);
  useEffect(() => {
    if (!editor) return;
    const syncOverlay = () => {
      const activeImage = parseImageOverlay(overlayStore.get());
      if (!activeImage) return;
      const selection = editor.state.selection;
      const remainsSelected = selection instanceof NodeSelection
        && selection.node.type.name === "managedImage"
        && selection.from === activeImage.position
        && String(selection.node.attrs.attachmentId || "") === activeImage.attachmentId;
      if (!remainsSelected) overlayStore.set(null);
    };
    editor.on("selectionUpdate", syncOverlay);
    return () => { editor.off("selectionUpdate", syncOverlay); };
  }, [editor]);
  useEffect(() => {
    if (!editor) return;
    const clearDropIndicator = () => {
      if (attachmentDropIndicatorKey.getState(editor.state) !== null) {
        editor.view.dispatch(editor.state.tr.setMeta(attachmentDropIndicatorKey, null).setMeta("addToHistory", false));
      }
    };
    const finishAttachmentDrag = () => {
      clearDropIndicator();
      endAttachmentDrag();
    };
    // dragend is emitted by the draggable attachment card, not necessarily
    // by the editor DOM, so listen at window level to cover cancellation.
    window.addEventListener("dragend", finishAttachmentDrag);
    window.addEventListener("drop", finishAttachmentDrag);
    return () => {
      window.removeEventListener("dragend", finishAttachmentDrag);
      window.removeEventListener("drop", finishAttachmentDrag);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const isOverEditorSurface = (event: DragEvent) => {
      const target = event.target instanceof Element ? event.target : document.elementFromPoint(event.clientX, event.clientY);
      return Boolean((target instanceof Element ? target : null)?.closest(".editor-scroll"));
    };
    const onWindowDragOver = (event: DragEvent) => {
      if (!editableRef.current || !hasAttachmentDrag(event.dataTransfer) || !isOverEditorSurface(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      void previewAttachmentDrop(editor.view, event);
    };
    const onWindowDrop = (event: DragEvent) => {
      if (!editableRef.current || !hasAttachmentDrag(event.dataTransfer) || !isOverEditorSurface(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void insertAttachmentDrop(editor.view, event);
    };
    window.addEventListener("dragover", onWindowDragOver, true);
    window.addEventListener("drop", onWindowDrop, true);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver, true);
      window.removeEventListener("drop", onWindowDrop, true);
    };
  }, [editor]);
  useEffect(() => { onReady(editor); return () => onReady(null); }, [editor, onReady]);

  const onDragOverCapture = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!editor || !hasAttachmentDrag(event.dataTransfer)) return;
    previewAttachmentDrop(editor.view, event.nativeEvent);
  };
  const onDropCapture = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!editor || !hasAttachmentDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    insertAttachmentDrop(editor.view, event.nativeEvent);
  };

  return <div className={`visual-editor ${editable ? "is-editing" : "is-preview"}`} data-attachment-count={attachments.length} data-link-preview-count={linkPreviews.length}>
    {editable && <ImageBubbleControls editor={editor} language={language} attachments={attachments} actions={actions} />}
    <div className="tiptap-drop-surface" onDragOverCapture={onDragOverCapture} onDropCapture={onDropCapture}>
      <EditorContent editor={editor} />
    </div>
  </div>;
}
