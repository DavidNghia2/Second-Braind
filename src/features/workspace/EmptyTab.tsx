import { BookOpen, Command, FilePlus2, FolderOpen, History, X } from "lucide-react";

export function EmptyTab({ language, onCreate, onOpen, onRecent, onCommand, onClose }: {
  language: "vi" | "en";
  onCreate: () => void;
  onOpen: () => void;
  onRecent: () => void;
  onCommand: () => void;
  onClose: () => void;
}) {
  const vi = language === "vi";
  return <div className="workspace-empty-tab">
    <span className="workspace-empty-icon"><BookOpen size={30} /></span>
    <h1>{vi ? "Tab mới" : "New tab"}</h1>
    <p>{vi ? "Mở một ghi chú hoặc bắt đầu một ý tưởng mới." : "Open a note or start a new idea."}</p>
    <div className="workspace-empty-actions">
      <button onClick={onCreate}><FilePlus2 size={17} /><span>{vi ? "Tạo ghi chú mới" : "Create new note"}</span><kbd>Ctrl N</kbd></button>
      <button onClick={onOpen}><FolderOpen size={17} /><span>{vi ? "Mở ghi chú" : "Open note"}</span><kbd>Ctrl O</kbd></button>
      <button onClick={onRecent}><History size={17} /><span>{vi ? "Ghi chú gần đây" : "Recent notes"}</span><kbd>Ctrl R</kbd></button>
      <button onClick={onCommand}><Command size={17} /><span>{vi ? "Command palette" : "Command palette"}</span><kbd>Ctrl P</kbd></button>
      <button onClick={onClose}><X size={17} /><span>{vi ? "Đóng tab" : "Close tab"}</span><kbd>Ctrl W</kbd></button>
    </div>
  </div>;
}
