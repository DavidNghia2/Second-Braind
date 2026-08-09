import { Clock3, FileText, Folder, Hash, Info, RotateCcw, Tags, Trash2, User } from "lucide-react";
import type { Folder as FolderType, Note } from "../notes/types";

const formatDate = (value: string | null, language: "vi" | "en") => value ? new Date(value).toLocaleString(language === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
const wordCount = (content: string) => content.trim().split(/\s+/).filter(Boolean).length;

export function TrashNotePreview({ language, note, folders, onRestore, onDelete }: {
  language: "vi" | "en";
  note: Note;
  folders: FolderType[];
  onRestore: (note: Note) => void;
  onDelete: (note: Note) => void;
}) {
  const vi = language === "vi";
  const folder = note.folder_id ? folders.find((item) => item.id === note.folder_id) : null;
  const folderName = folder?.name ?? (vi ? "Không có thư mục" : "Unfiled");
  const words = wordCount(note.content);
  return <div className="trash-preview-layout"><article className="trash-preview-pane"><header className="trash-note-header"><span className="trash-note-icon"><FileText size={28} /></span><div><div className="trash-note-title-row"><h1>{note.title || (vi ? "Chưa có tiêu đề" : "Untitled")}</h1><span className="trash-status-label">Trash</span></div><p><span><Folder size={13} />{folderName}</span><span><Clock3 size={13} />{formatDate(note.deleted_at, language)}</span><span><Hash size={13} />{words} {vi ? "từ" : "words"}</span></p></div></header><div className="trash-preview-content-card"><span>{vi ? "Nội dung ghi chú — chỉ đọc" : "Note content — read only"}</span><div>{note.content?.trim() || (vi ? "Ghi chú này không có nội dung xem trước." : "This note has no preview content.")}</div></div></article><aside className="trash-detail-stack"><section className="trash-detail-card"><button className="primary-button" onClick={() => onRestore(note)}><RotateCcw size={15} />{vi ? "Khôi phục" : "Restore"}</button><button className="danger-outline-button" onClick={() => onDelete(note)}><Trash2 size={15} />{vi ? "Xóa vĩnh viễn" : "Delete permanently"}</button></section><section className="trash-detail-card"><h3>{vi ? "Thông tin chi tiết" : "Details"}</h3><dl><div><dt><Clock3 size={15} />{vi ? "Thời gian xóa" : "Deleted at"}</dt><dd>{formatDate(note.deleted_at, language)}</dd></div><div><dt><Folder size={15} />{vi ? "Thư mục cũ" : "Previous folder"}</dt><dd>{folderName}</dd></div><div><dt><Tags size={15} />Tag</dt><dd>—</dd></div><div><dt><Info size={15} />{vi ? "Metadata" : "Metadata"}</dt><dd>{words} {vi ? "từ" : "words"} · {note.content_format}</dd></div><div><dt><User size={15} />{vi ? "Người xóa" : "Deleted by"}</dt><dd>{vi ? "Bạn" : "You"}</dd></div></dl></section></aside></div>;
}
