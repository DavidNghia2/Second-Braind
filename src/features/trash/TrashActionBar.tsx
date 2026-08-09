import { RotateCcw, Trash2, X } from "lucide-react";

export function TrashActionBar({ language, count, onRestore, onDelete, onClear }: {
  language: "vi" | "en";
  count: number;
  onRestore: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (!count) return null;
  const vi = language === "vi";
  return <div className="trash-bulk-bar"><span><span className="trash-check checked" aria-hidden="true" />{vi ? `${count} mục được chọn` : `${count} selected`}</span><div><button className="secondary-button" onClick={onClear}><X size={15} />{vi ? "Bỏ chọn" : "Clear"}</button><button className="secondary-button" onClick={onRestore}><RotateCcw size={15} />{vi ? "Khôi phục đã chọn" : "Restore selected"}</button><button className="danger-outline-button" onClick={onDelete}><Trash2 size={15} />{vi ? "Xóa vĩnh viễn đã chọn" : "Delete selected"}</button></div></div>;
}
