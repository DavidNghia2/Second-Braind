import type { RefObject } from "react";
import {
  Bold,
  Code2,
  Heading1,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Image as ImageIcon,
  Paperclip,
  Quote,
  Video,
} from "lucide-react";

type Tool = {
  labelVi: string;
  labelEn: string;
  icon: typeof Bold;
  before: string;
  after?: string;
  placeholder?: string;
  block?: boolean;
};

const tools: Tool[] = [
  { labelVi: "Tiêu đề", labelEn: "Heading", icon: Heading1, before: "# ", block: true },
  { labelVi: "In đậm", labelEn: "Bold", icon: Bold, before: "**", after: "**", placeholder: "văn bản" },
  { labelVi: "In nghiêng", labelEn: "Italic", icon: Italic, before: "*", after: "*", placeholder: "văn bản" },
  { labelVi: "Danh sách", labelEn: "Bullet list", icon: List, before: "- ", block: true },
  { labelVi: "Danh sách số", labelEn: "Numbered list", icon: ListOrdered, before: "1. ", block: true },
  { labelVi: "Danh sách việc", labelEn: "Checklist", icon: ListChecks, before: "- [ ] ", block: true },
  { labelVi: "Trích dẫn", labelEn: "Quote", icon: Quote, before: "> ", block: true },
  { labelVi: "Mã", labelEn: "Code", icon: Code2, before: "`", after: "`", placeholder: "code" },
];

export function MarkdownToolbar({
  textareaRef,
  value,
  language,
  onChange,
  onImage,
  onAttachment,
  onLink,
  onYoutube,
  attachmentDisabled = false,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  language: "vi" | "en";
  onChange: (value: string) => void;
  onImage: () => void;
  onAttachment: () => void;
  onLink: () => void;
  onYoutube: () => void;
  attachmentDisabled?: boolean;
}) {
  const apply = (tool: Tool) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = value.slice(start, end) || tool.placeholder || "";
    const lineStart = tool.block ? value.lastIndexOf("\n", Math.max(0, start - 1)) + 1 : start;
    const insertion = `${tool.before}${selection}${tool.after ?? ""}`;
    const next = `${value.slice(0, lineStart)}${insertion}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const selectionStart = lineStart + tool.before.length;
      textarea.setSelectionRange(selectionStart, selectionStart + selection.length);
    });
  };

  return <div className="markdown-toolbar" role="toolbar" aria-label={language === "vi" ? "Công cụ Markdown" : "Markdown tools"}>
    {tools.map((tool, index) => {
      const Icon = tool.icon;
      const label = language === "vi" ? tool.labelVi : tool.labelEn;
      return <button className={index === 3 || index === 6 ? "toolbar-divider" : undefined} key={tool.labelEn} title={label} aria-label={label} onClick={() => apply(tool)}><Icon size={16} /></button>;
    })}
    <button className="toolbar-divider" disabled={attachmentDisabled} title={language === "vi" ? "Chèn hình ảnh" : "Insert image"} aria-label={language === "vi" ? "Chèn hình ảnh" : "Insert image"} onClick={onImage}><ImageIcon size={16} /></button>
    <button disabled={attachmentDisabled} title={language === "vi" ? "Đính kèm file" : "Attach file"} aria-label={language === "vi" ? "Đính kèm file" : "Attach file"} onClick={onAttachment}><Paperclip size={16} /></button>
    <button title={language === "vi" ? "Chèn liên kết" : "Insert link"} aria-label={language === "vi" ? "Chèn liên kết" : "Insert link"} onClick={onLink}><Link size={16} /></button>
    <button title={language === "vi" ? "Chèn YouTube" : "Insert YouTube"} aria-label={language === "vi" ? "Chèn YouTube" : "Insert YouTube"} onClick={onYoutube}><Video size={16} /></button>
  </div>;
}
