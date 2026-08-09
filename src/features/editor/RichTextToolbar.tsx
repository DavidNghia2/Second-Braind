import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { Bold, Braces, Code2, Image, Italic, Link, List, ListChecks, ListOrdered, Minus, Paperclip, Plus, Quote, Redo2, Strikethrough, Underline, Undo2, Video } from "lucide-react";

const fontFamilies = [
  ["system", "System Default", ""], ["inter", "Inter", "Inter"], ["segoe", "Segoe UI", "Segoe UI"], ["arial", "Arial", "Arial"], ["georgia", "Georgia", "Georgia"], ["lora", "Lora", "Lora"], ["merriweather", "Merriweather", "Merriweather"], ["jetbrains", "JetBrains Mono", "JetBrains Mono"], ["fira", "Fira Code", "Fira Code"],
] as const;
const commonSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];
const clampSize = (value: number) => Math.min(96, Math.max(8, Number.isFinite(value) ? value : 16));

function ToolButton({ label, active = false, disabled = false, onClick, children, menu = false }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; menu?: boolean }) {
  return <button type="button" className={active ? "active" : ""} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={(event) => { onClick(); if (menu) event.currentTarget.closest("details")?.removeAttribute("open"); }}>{children}</button>;
}

export function RichTextToolbar({ editor, language, attachmentDisabled, onImage, onAttachment, onLink, onYoutube }: {
  editor: Editor | null;
  language: "vi" | "en";
  attachmentDisabled?: boolean;
  onImage: () => void;
  onAttachment: () => void;
  onLink: () => void;
  onYoutube: () => void;
}) {
  const vi = language === "vi";
  const state = useEditorState({ editor, selector: ({ editor: current }) => {
    if (!current) return null;
    const style = current.getAttributes("textStyle");
    const heading = current.isActive("heading", { level: 1 }) ? "h1" : current.isActive("heading", { level: 2 }) ? "h2" : current.isActive("heading", { level: 3 }) ? "h3" : "paragraph";
    return {
      heading, fontFamily: String(style.fontFamily || ""), fontSize: Number.parseInt(String(style.fontSize || "16"), 10) || 16,
      bold: current.isActive("bold"), italic: current.isActive("italic"), underline: current.isActive("underline"), strike: current.isActive("strike"),
      bullet: current.isActive("bulletList"), ordered: current.isActive("orderedList"), task: current.isActive("taskList"), quote: current.isActive("blockquote"), code: current.isActive("code"), codeBlock: current.isActive("codeBlock"),
      canUndo: current.can().chain().focus().undo().run(), canRedo: current.can().chain().focus().redo().run(),
    };
  } });
  const [fontInput, setFontInput] = useState("16");
  useEffect(() => setFontInput(String(state?.fontSize ?? 16)), [state?.fontSize]);
  if (!editor || !state) return <div className="rich-toolbar toolbar-loading" />;

  const applySize = (value: number) => {
    const next = clampSize(value);
    setFontInput(String(next));
    editor.chain().focus().setFontSize(`${next}px`).run();
  };
  const fontValue = fontFamilies.find((font) => font[2] === state.fontFamily)?.[0] ?? "system";

  return <div className="rich-toolbar" role="toolbar" aria-label={vi ? "Thanh công cụ soạn thảo" : "Editor toolbar"}>
    <select aria-label={vi ? "Kiểu đoạn" : "Paragraph style"} value={state.heading} onChange={(event) => { const value = event.target.value; if (value === "paragraph") editor.chain().focus().setParagraph().run(); else editor.chain().focus().toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run(); }}><option value="paragraph">{vi ? "Đoạn văn" : "Paragraph"}</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select>
    <select className="font-family-select" aria-label={vi ? "Font chữ" : "Font family"} value={fontValue} onChange={(event) => { const font = fontFamilies.find((item) => item[0] === event.target.value); if (!font || !font[2]) editor.chain().focus().unsetFontFamily().run(); else editor.chain().focus().setFontFamily(font[2]).run(); }}>{fontFamilies.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <div className="font-size-control"><ToolButton label={vi ? "Giảm cỡ chữ" : "Decrease font size"} onClick={() => applySize(state.fontSize - 1)}><Minus size={14} /></ToolButton><input list="editor-font-sizes" inputMode="numeric" aria-label={vi ? "Cỡ chữ" : "Font size"} value={fontInput} onChange={(event) => setFontInput(event.target.value.replace(/[^0-9]/g, ""))} onBlur={() => applySize(Number(fontInput))} onKeyDown={(event) => { if (event.key === "Enter") applySize(Number(fontInput)); }} /><datalist id="editor-font-sizes">{commonSizes.map((size) => <option value={size} key={size} />)}</datalist><ToolButton label={vi ? "Tăng cỡ chữ" : "Increase font size"} onClick={() => applySize(state.fontSize + 1)}><Plus size={14} /></ToolButton></div>
    <span className="toolbar-separator" />
    <ToolButton label="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></ToolButton><ToolButton label="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolButton><ToolButton label="Underline" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline size={16} /></ToolButton><ToolButton label={vi ? "Gạch ngang" : "Strikethrough"} active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={16} /></ToolButton>
    <span className="toolbar-separator" />
    <ToolButton label={vi ? "Danh sách" : "Bullet list"} active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></ToolButton><ToolButton label={vi ? "Danh sách số" : "Ordered list"} active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolButton><ToolButton label={vi ? "Danh sách việc" : "Checklist"} active={state.task} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks size={16} /></ToolButton><ToolButton label={vi ? "Trích dẫn" : "Blockquote"} active={state.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></ToolButton><ToolButton label={vi ? "Mã nội tuyến" : "Inline code"} active={state.code} onClick={() => editor.chain().focus().toggleCode().run()}><Code2 size={16} /></ToolButton><ToolButton label={vi ? "Khối mã" : "Code block"} active={state.codeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Braces size={16} /></ToolButton>
    <span className="toolbar-separator" />
    <ToolButton label={vi ? "Chèn ảnh" : "Insert image"} disabled={attachmentDisabled} onClick={onImage}><Image size={16} /></ToolButton><ToolButton label={vi ? "Đính kèm file" : "Attach file"} disabled={attachmentDisabled} onClick={onAttachment}><Paperclip size={16} /></ToolButton><ToolButton label={vi ? "Chèn liên kết" : "Insert link"} onClick={onLink}><Link size={16} /></ToolButton><ToolButton label={vi ? "Chèn YouTube" : "Insert YouTube"} onClick={onYoutube}><Video size={16} /></ToolButton>
    <span className="toolbar-separator" />
    <ToolButton label={vi ? "Hoàn tác" : "Undo"} disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></ToolButton><ToolButton label={vi ? "Làm lại" : "Redo"} disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></ToolButton>
  </div>;
}
