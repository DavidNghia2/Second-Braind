export type SaveState = "editing" | "saving" | "saved" | "failed";

export type Note = {
  id: string;
  folder_id: string | null;
  title: string;
  content: string;
  content_format: "markdown" | "richtext";
  content_json: string | null;
  legacy_markdown: string | null;
  is_favorite: number;
  is_pinned: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Folder = {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type StorageLocation = {
  id: string;
  path: string;
  created_at: string;
  last_used_at: string;
};

export type Attachment = {
  id: string;
  note_id: string;
  storage_location_id: string | null;
  original_name: string;
  stored_name: string | null;
  mime_type: string | null;
  size_bytes: number;
  storage_mode: "managed" | "linked";
  relative_path: string | null;
  external_path: string | null;
  display_mode: "compact" | "card" | "preview";
  caption: string | null;
  width_mode: "small" | "medium" | "large" | "full";
  created_at: string;
  deleted_at: string | null;
};

export type LinkPreview = {
  id: string;
  note_id: string;
  url: string;
  provider: "youtube" | "github" | "article" | "generic";
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  display_mode: "card" | "embed" | "link";
  metadata_json: string | null;
  fetched_at: string | null;
  created_at: string;
};

export type EditorSettings = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
};

export type NotePatch = Partial<Pick<Note, "folder_id" | "title" | "content" | "content_format" | "content_json" | "legacy_markdown" | "is_favorite" | "is_pinned">>;
