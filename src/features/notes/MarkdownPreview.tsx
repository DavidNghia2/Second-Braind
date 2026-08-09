import type { ReactNode } from "react";
import { AttachmentBlock, InlineAttachmentImage, LinkPreviewBlock, MissingAttachmentToken, type MarkdownBlockActions } from "./MarkdownBlocks";
import { storageService } from "./storageService";
import type { Attachment, LinkPreview } from "./types";

const safeUrl = (value: string) => {
  if (!/^(?:https?:|mailto:)/i.test(value.trim())) return "#";
  try {
    const url = new URL(value, "https://local.invalid");
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : "#";
  } catch {
    return "#";
  }
};

type PreviewProps = MarkdownBlockActions & {
  content: string;
  attachments?: Attachment[];
  linkPreviews?: LinkPreview[];
  emptyText?: string;
};

function inline(text: string, attachments: Map<string, Attachment>, links: Map<string, LinkPreview>, actions: MarkdownBlockActions): ReactNode[] {
  const parts = text.split(/(!\[[^\]]*\]\(secondbrain:\/\/attachment\/[^)]+\)|@\[(?:attachment|youtube|github|link-card)\]\([^)]*\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    const image = part.match(/^!\[([^\]]*)\]\(secondbrain:\/\/attachment\/([^\)]+)\)$/);
    if (image) {
      const attachment = attachments.get(image[2]);
      return attachment ? <InlineAttachmentImage key={index} attachment={{ ...attachment, caption: image[1] || attachment.caption }} actions={actions} /> : <MissingAttachmentToken key={index} label={image[1]} language={actions.language} />;
    }
    const block = part.match(/^@\[(attachment|youtube|github|link-card)\]\(([^)]*)\)$/);
    if (block) {
      if (block[1] === "attachment") {
        const attachment = attachments.get(block[2]);
        return attachment ? <AttachmentBlock key={index} attachment={attachment} actions={actions} /> : <MissingAttachmentToken key={index} label={block[2]} language={actions.language} />;
      }
      const preview = links.get(block[2]);
      if (preview) return <LinkPreviewBlock key={index} preview={preview} actions={actions} />;
      const blockUrl = safeUrl(block[2]);
      return <a key={index} href={blockUrl} onClick={(event) => { event.preventDefault(); if (blockUrl && blockUrl !== "#") void storageService.openUrl(blockUrl); }} title="Mở liên kết bên ngoài ứng dụng">{block[2]}</a>;
    }
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const linkUrl = safeUrl(link[2]);
      return <a key={index} href={linkUrl} onClick={(event) => { event.preventDefault(); if (linkUrl && linkUrl !== "#") void storageService.openUrl(linkUrl); }} title="Mở liên kết bên ngoài ứng dụng">{link[1]}</a>;
    }
    return part;
  });
}

export function MarkdownPreview({ content, attachments = [], linkPreviews = [], emptyText = "Chưa có nội dung để xem trước.", ...actions }: PreviewProps) {
  const lines = content.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let code: string[] | null = null;
  let bullets: { text: string; checked?: boolean }[] = [];
  let ordered: string[] = [];
  const attachmentMap = new Map(attachments.map((item) => [item.id, item]));
  const linkMap = new Map(linkPreviews.map((item) => [item.url, item]));

  const flushLists = () => {
    if (bullets.length) {
      const items = bullets;
      nodes.push(<ul className={items.some((item) => item.checked !== undefined) ? "task-list" : undefined} key={`ul-${nodes.length}`}>
        {items.map((item, index) => <li className={item.checked !== undefined ? "task-item" : undefined} key={index}>
          {item.checked !== undefined && <input type="checkbox" checked={item.checked} readOnly aria-label={item.checked ? "Đã hoàn thành" : "Chưa hoàn thành"} />}
          {inline(item.text, attachmentMap, linkMap, actions)}
        </li>)}
      </ul>);
      bullets = [];
    }
    if (ordered.length) {
      const items = ordered;
      nodes.push(<ol key={`ol-${nodes.length}`}>{items.map((item, index) => <li key={index}>{inline(item, attachmentMap, linkMap, actions)}</li>)}</ol>);
      ordered = [];
    }
  };

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      flushLists();
      if (code) {
        nodes.push(<pre key={`code-${index}`}><code>{code.join("\n")}</code></pre>);
        code = null;
      } else code = [];
      return;
    }
    if (code) { code.push(line); return; }
    const task = line.match(/^\s*[-*]\s+\[([ xX])]\s+(.+)$/);
    if (task) { if (ordered.length) flushLists(); bullets.push({ text: task[2], checked: task[1].toLowerCase() === "x" }); return; }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) { if (ordered.length) flushLists(); bullets.push({ text: bullet[1] }); return; }
    const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (numbered) { if (bullets.length) flushLists(); ordered.push(numbered[1]); return; }
    flushLists();
    if (/^\s*(?:!\[[^\]]*\]\(secondbrain:\/\/attachment\/[^)]+\)|@\[(?:attachment|youtube|github|link-card)\]\([^)]*\))\s*$/.test(line)) {
      nodes.push(<div className="markdown-block-line" key={index}>{inline(line.trim(), attachmentMap, linkMap, actions)}</div>);
      return;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      if (level === 1) nodes.push(<h1 key={index}>{inline(heading[2], attachmentMap, linkMap, actions)}</h1>);
      else if (level === 2) nodes.push(<h2 key={index}>{inline(heading[2], attachmentMap, linkMap, actions)}</h2>);
      else nodes.push(<h3 key={index}>{inline(heading[2], attachmentMap, linkMap, actions)}</h3>);
    } else if (line.startsWith("> ")) nodes.push(<blockquote key={index}>{inline(line.slice(2), attachmentMap, linkMap, actions)}</blockquote>);
    else if (/^---+$/.test(line.trim())) nodes.push(<hr key={index} />);
    else if (!line.trim()) nodes.push(<div className="markdown-space" key={index} />);
    else nodes.push(<p key={index}>{inline(line, attachmentMap, linkMap, actions)}</p>);
  });
  flushLists();
  const unclosedCode = code as string[] | null;
  if (unclosedCode) nodes.push(<pre key="code-final"><code>{unclosedCode.join("\n")}</code></pre>);
  return <div className="markdown-preview">{nodes.length ? nodes : <span className="preview-empty">{emptyText}</span>}</div>;
}
