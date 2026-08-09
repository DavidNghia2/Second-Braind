import type { JSONContent } from "@tiptap/core";
import type { Note } from "../notes/types";

const inlinePattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)]+\))/g;

function inlineContent(value: string): JSONContent[] {
  return value.split(inlinePattern).filter(Boolean).map((part) => {
    if (part.startsWith("`") && part.endsWith("`")) return { type: "text", text: part.slice(1, -1), marks: [{ type: "code" }] };
    if (part.startsWith("**") && part.endsWith("**")) return { type: "text", text: part.slice(2, -2), marks: [{ type: "bold" }] };
    if (part.startsWith("*") && part.endsWith("*")) return { type: "text", text: part.slice(1, -1), marks: [{ type: "italic" }] };
    const link = part.match(/^\[([^\]]+)]\(([^)]+)\)$/);
    if (link) return { type: "text", text: link[1], marks: [{ type: "link", attrs: { href: link[2], target: "_blank", rel: "noopener noreferrer" } }] };
    return { type: "text", text: part };
  });
}

const paragraph = (text = ""): JSONContent => ({ type: "paragraph", content: text ? inlineContent(text) : undefined });

export function markdownToRichDocument(markdown: string): JSONContent {
  const content: JSONContent[] = [];
  const lines = markdown.split(/\r?\n/);
  let code: string[] | null = null;
  let bulletItems: JSONContent[] = [];
  let orderedItems: JSONContent[] = [];
  let taskItems: JSONContent[] = [];

  const flushLists = () => {
    if (bulletItems.length) content.push({ type: "bulletList", content: bulletItems.splice(0) });
    if (orderedItems.length) content.push({ type: "orderedList", content: orderedItems.splice(0) });
    if (taskItems.length) content.push({ type: "taskList", content: taskItems.splice(0) });
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushLists();
      if (code) {
        content.push({ type: "codeBlock", content: code.length ? [{ type: "text", text: code.join("\n") }] : undefined });
        code = null;
      } else code = [];
      continue;
    }
    if (code) { code.push(line); continue; }

    const managedImage = line.trim().match(/^!\[([^\]]*)]\(secondbrain:\/\/attachment\/([^)]+)\)$/);
    if (managedImage) {
      flushLists();
      content.push({ type: "managedImage", attrs: { attachmentId: managedImage[2], width: 560, alignment: "center", caption: managedImage[1], alt: managedImage[1] } });
      continue;
    }
    const attachment = line.trim().match(/^@\[attachment]\(([^)]+)\)$/);
    if (attachment) {
      flushLists();
      content.push({ type: "attachmentBlock", attrs: { attachmentId: attachment[1], displayMode: "card" } });
      continue;
    }
    const smartLink = line.trim().match(/^@\[(youtube|github|link-card)]\(([^)]+)\)$/);
    if (smartLink) {
      flushLists();
      content.push({ type: "smartLink", attrs: { url: smartLink[2], provider: smartLink[1] === "link-card" ? "generic" : smartLink[1], displayMode: "card" } });
      continue;
    }

    const task = line.match(/^\s*[-*]\s+\[([ xX])]\s+(.+)$/);
    if (task) {
      if (bulletItems.length || orderedItems.length) flushLists();
      taskItems.push({ type: "taskItem", attrs: { checked: task[1].toLowerCase() === "x" }, content: [paragraph(task[2])] });
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      if (orderedItems.length || taskItems.length) flushLists();
      bulletItems.push({ type: "listItem", content: [paragraph(bullet[1])] });
      continue;
    }
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      if (bulletItems.length || taskItems.length) flushLists();
      orderedItems.push({ type: "listItem", content: [paragraph(ordered[1])] });
      continue;
    }

    flushLists();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) content.push({ type: "heading", attrs: { level: heading[1].length }, content: inlineContent(heading[2]) });
    else if (line.startsWith("> ")) content.push({ type: "blockquote", content: [paragraph(line.slice(2))] });
    else if (/^---+$/.test(line.trim())) content.push({ type: "horizontalRule" });
    else content.push(paragraph(line));
  }
  flushLists();
  if (code) content.push({ type: "codeBlock", content: code.length ? [{ type: "text", text: code.join("\n") }] : undefined });
  return { type: "doc", content: content.length ? content : [paragraph()] };
}

export function documentForNote(note: Note): JSONContent {
  if (note.content_format === "richtext" && note.content_json) {
    try {
      const parsed = JSON.parse(note.content_json) as JSONContent;
      if (parsed?.type === "doc") return parsed;
    } catch {
      // Fall back to the searchable Markdown/plain-text representation.
    }
  }
  return markdownToRichDocument(note.content);
}

export function documentSearchText(document: JSONContent): string {
  const blocks: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === "text" && node.text) blocks.push(node.text);
    else if (node.type === "managedImage") blocks.push(String(node.attrs?.caption || node.attrs?.alt || "image"));
    else if (node.type === "attachmentBlock") blocks.push(String(node.attrs?.fileName || "attachment"));
    else if (node.type === "smartLink") blocks.push(String(node.attrs?.title || node.attrs?.url || "link"));
    node.content?.forEach(visit);
    if (["paragraph", "heading", "blockquote", "codeBlock", "listItem", "taskItem"].includes(node.type ?? "")) blocks.push("\n");
  };
  visit(document);
  return blocks.join(" ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
