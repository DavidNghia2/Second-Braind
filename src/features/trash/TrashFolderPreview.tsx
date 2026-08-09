import { Clock3, FileText, Folder, RotateCcw, Trash2 } from "lucide-react";
import type { Folder as FolderType, Note } from "../notes/types";
import { notesInFolderTree } from "./trashModel";

const formatDate = (value: string | null, language: "vi" | "en") => value ? new Date(value).toLocaleString(language === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

export function TrashFolderPreview({ language, folder, folders, notes, onRestore, onDelete }: {
  language: "vi" | "en";
  folder: FolderType;
  folders: FolderType[];
  notes: Note[];
  onRestore: (folder: FolderType) => void;
  onDelete: (folder: FolderType) => void;
}) {
  const vi = language === "vi";
  const containedNotes = notesInFolderTree(folder.id, folders, notes).filter((note) => note.deleted_at);
  return <div className="trash-preview-layout"><article className="trash-preview-pane"><header className="trash-note-header"><span className="trash-note-icon"><Folder size={28} /></span><div><div className="trash-note-title-row"><h1>{folder.name}</h1><span className="trash-status-label">Trash</span></div><p><span><Clock3 size={13} />{formatDate(folder.deleted_at, language)}</span><span><FileText size={13} />{containedNotes.length} {vi ? "ghi chú" : "notes"}</span></p></div></header><div className="trash-preview-content-card"><span>{vi ? "Ghi chú trong thư mục" : "Notes in folder"}</span><div className="trash-folder-preview-list">{containedNotes.length ? containedNotes.map((note) => <div key={note.id}><FileText size={14} /><span>{note.title || (vi ? "Chưa có tiêu đề" : "Untitled")}</span></div>) : <p>{vi ? "Thư mục không có ghi chú." : "This folder contains no notes."}</p>}</div></div></article><aside className="trash-detail-stack"><section className="trash-detail-card"><button className="primary-button" onClick={() => onRestore(folder)}><RotateCcw size={15} />{vi ? "Khôi phục thư mục" : "Restore folder"}</button><button className="danger-outline-button" onClick={() => onDelete(folder)}><Trash2 size={15} />{vi ? "Xóa vĩnh viễn thư mục" : "Delete folder permanently"}</button></section><section className="trash-detail-card"><h3>{vi ? "Thông tin thư mục" : "Folder details"}</h3><dl><div><dt><Clock3 size={15} />{vi ? "Thời gian xóa" : "Deleted at"}</dt><dd>{formatDate(folder.deleted_at, language)}</dd></div><div><dt><FileText size={15} />{vi ? "Ghi chú bên trong" : "Contained notes"}</dt><dd>{containedNotes.length}</dd></div></dl></section></aside></div>;
}
