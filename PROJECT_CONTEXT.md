# Second Brain – Project Context for AI Agents

This file is the single hand-off document for the project. Read it before changing code.

## 1. Product and runtime

Second Brain is a Windows desktop note-taking application built with:

- Tauri 2 + Rust backend (`src-tauri`)
- React 19 + TypeScript + Vite frontend (`src`)
- Tiptap 3 / ProseMirror rich-text editor
- SQLite through `@tauri-apps/plugin-sql`
- Tauri dialog, opener, store, and filesystem plugins

Start development with `npm.cmd run tauri dev`. Frontend-only development is `npm.cmd run dev`.

Do not replace the editor, SQLite attachment model, autosave queue, or Rust storage commands. Extend the existing services and nodes.

## 2. Repository map

```text
src/
  App.tsx                         application shell, note selection, editor wiring, global overlays/drop zone
  App.css                         all application/editor/attachment styles
  main.tsx                        React bootstrap
  features/editor/
    RichTextEditor.tsx            Tiptap instance, paste/drop, overlay synchronization
    RichNodeViews.tsx             managedImage, attachmentBlock, smartLink NodeViews
    RichTextToolbar.tsx            editor toolbar
    document.ts                    legacy/rich document conversion helpers
    attachmentDrag.ts              custom attachment drag MIME and in-memory fallback
    overlayStore.ts                one global controlled overlay id
  features/notes/
    useNotesStore.ts               notes/folders state, debounce and serialized autosave
    noteService.ts                 service facade for repositories and Rust backup commands
    noteRepository.ts              SQLite queries for notes, folders, attachments, links
    database.ts                    SQLite connection/migrations
    storageService.ts              attachment import/resolve/open/remove facade
    attachmentDisplayService.ts    resolves attachment URL and availability for NodeViews
    AttachmentsPanel.tsx           attachment list, drag source, file menu
    types.ts                        Note, Attachment, Folder, LinkPreview and state types
  features/workspace/
    workspaceStore.ts               WorkspaceTab/sidebar state with Tauri Store persistence
    WorkspaceShell.tsx              Ribbon/sidebar/main workspace grid and resize handle
    WorkspaceTabs.tsx               Preview/pinned tabs, middle-click close and drag reorder
    EmptyTab.tsx                    Empty workspace tab actions and shortcuts
  features/sidebar/
    Ribbon.tsx                      Files/Search/Bookmarks/Tags/Calendar/Graph/Settings rail
    FileExplorer.tsx                Resizable file tree, toolbar, search and note context menu
    SidebarViewPanel.tsx            Placeholder panels for non-file sidebar views
src-tauri/
  src/lib.rs                       Tauri app/plugin setup and command registration
  src/storage.rs                   import, resolve, open, reveal, delete storage commands
  src/backup.rs                    backup/error logging commands
  migrations/                      SQLite schema migrations
```

## 3. Core data model

`Note` contains both legacy text and rich content:

- `content_format`: normally `richtext` for the Tiptap editor
- `content_json`: serialized ProseMirror JSON (`{ type: "doc", content: [...] }`)
- `content`: searchable plain text generated from the document
- `legacy_markdown`/old content is retained for compatibility

`Attachment` is a database row identified by `id`. Important fields are `note_id`, `original_name`, `mime_type`, `storage_mode` (`managed` or `linked`), storage path fields, caption/display/width settings, and soft-delete timestamp.

An attachment can be referenced in a document many times. Referencing it must never import the physical file again or insert another SQLite row.

## 4. Application lifecycle and note state

1. `main.tsx` mounts `App`.
2. `App` calls `useNotesStore` and loads notes/folders through `noteService`.
3. The first non-deleted note is selected.
4. Selecting a different note flushes the previous note before changing `selectedId`.
5. `RichTextEditor` receives the selected note and calls `documentForNote(note)` for initial content.
6. When the selected note changes, the editor calls `setContent(documentForNote(note))` without emitting an update.
7. `AttachmentsPanel` refreshes from the attachment table and also discovers attachment IDs in `content_json` and legacy text so referenced rows remain visible.

The workspace shell is layered around this lifecycle and does not replace it:

1. `workspaceStore.hydrate()` restores tabs, active tab, sidebar visibility/width, and active ribbon view from `workspace.json` through Tauri Store.
2. An empty tab has `noteId: null` and never calls `noteService.create()`.
3. Opening a note from `FileExplorer` calls the existing `store.flush()` before `store.selectNote()` and creates a preview tab; double-click promotes it to a pinned tab.
4. Tab switching, closing, Ctrl+W, and Ctrl+Tab use the same flush path. Closing the last tab creates another empty tab only in workspace state.
5. Sidebar width is clamped to 220–480 px and persistence is debounced. Split panes are intentionally not implemented in this phase.

## 5. Autosave sequence

```text
editor transaction
  -> RichTextEditor onUpdate(editor.getJSON())
  -> App.handleDocumentChange()
  -> store.updateSelected({ content, content_format, content_json })
  -> mark note dirty + increment revision
  -> debounce 700 ms per note
  -> serialized flush queue
  -> noteService.update()
  -> noteRepository UPDATE notes
  -> only clear dirty state if the revision is still current
```

Changing title, metadata, or content uses the same update/debounce path. Switching notes, creating a note, moving to Trash, and closing the window flush pending changes first. On close, Tauri `close-requested` is prevented until `flushAll()` succeeds, then the database closes and `exit_app` is invoked.

## 6. Attachment import and storage sequence

Normal import:

```text
choose file / external drop
  -> storageService.importForNote/importPathForNote/importBytesForNote
  -> Rust import_attachment or import_attachment_bytes
  -> physical managed copy or linked path
  -> attachmentRepository.add(imported metadata)
  -> App remembers attachment and inserts a Tiptap node
```

Displaying an existing attachment calls `attachmentDisplayService`, which resolves its path through Rust (`resolve_managed_attachment` or `register_linked_asset`), checks `attachment_exists`, and converts it to a webview URL.

Removing an attachment from a note uses `storageService.unlink` through `App.detachAttachment`; this removes the database association/row but intentionally keeps the physical file. Permanent note deletion uses `storageService.remove` and deletes managed physical files.

## 7. Tiptap document and NodeViews

`createRichNodes()` registers three atom block nodes:

- `managedImage`: `attachmentId`, width, alignment, caption, alt; rendered by `ImageNodeView`.
- `attachmentBlock`: `attachmentId`, display mode; rendered by `AttachmentNodeView`.
- `smartLink`: URL/provider/display mode/title; rendered by `SmartLinkNodeView`.

All NodeViews are selectable and draggable at the ProseMirror level. `managedImage` uses a React NodeView wrapper with an image, missing-file controls, caption, and resize handle.

## 8. Attachment drag source → editor drop flow

### Drag start

`AttachmentsPanel.tsx` renders each card with `draggable`. On `dragstart` it:

1. closes other overlays;
2. stores `{ attachmentId, mimeType, originalName }` in `activeAttachmentDrag`;
3. writes the same JSON to `DataTransfer` using `application/x-secondbrain-attachment`;
4. writes only the display name to `text/plain` (never a physical path);
5. sets `effectAllowed = "copy"` and visual dragging state.

The attachment menu blocks drag initiation so Open File/Explorer are not accidentally triggered.

### Drag over

`RichTextEditor` handles dragover in two places for robustness:

- ProseMirror `handleDOMEvents.dragover`;
- React `onDragOverCapture` on `.tiptap-drop-surface`, the direct wrapper around `EditorContent`.

Both read the custom payload (or the in-memory WebView2 fallback), call `view.posAtCoords({ left, top })`, build the correct node, and call `dropPoint` to obtain a valid insertion position. If coordinates are unavailable in blank space, the end of the document is used as the fallback. The drop surface and the actual `.ProseMirror` element both have a minimum height. A ProseMirror widget decoration (`attachmentDropIndicatorKey`) marks the insertion position.

### Drop

React `onDropCapture` is the reliable first path because NodeViews/outer containers can otherwise consume the event. It calls the same `insertAttachmentDrop()` used by ProseMirror `handleDrop`:

1. validate edit mode and payload;
2. find the existing attachment row by ID when available;
3. classify image by MIME or extension;
4. create `managedImage` for images, otherwise `attachmentBlock`;
5. calculate `posAtCoords` + `dropPoint`;
6. insert exactly at that position and scroll into view;
7. dispatch a normal document transaction so autosave runs;
8. never call an import command or attachment repository `add`.

The outer `editor-scroll` drop zone handles ordinary OS file drops. If the custom attachment drag is detected, it prevents the external-import path from running.

`dragend`, `drop`, and `dragleave` clear the indicator. `attachmentDrag.ts` treats the active in-memory payload as valid even if WebView2 hides the custom MIME type during dragover/drop.

## 9. Image click and popup event sequence

The image popup is controlled by one global `overlayStore` string. Image IDs are generated as `image:<position>:<encodedAttachmentId>`; the More submenu uses `image-more:<position>:<encodedAttachmentId>`.

### Single click

`ImageNodeView` selects on `pointerdown` (unless the target is a button or resize handle), calls `setNodeSelection(getPos())`, and focuses the editor. It does not change overlay state. There is intentionally no popup logic in `onClick`.

### Double click

The real `onDoubleClick` handler prevents the browser default where needed, selects/focuses the same node, then sets the image overlay ID. `ImageBubbleControls` renders only when the current selection is the same `managedImage` and the active overlay ID matches.

### Closing

`App` installs a capture-phase document `pointerdown` listener and a document `keydown` listener:

- click outside `[data-overlay-root]` closes the overlay;
- Escape closes the overlay;
- switching notes or editor mode closes the overlay.

The image NodeView wrapper, resize handle, BubbleMenu, and menu controls carry `data-overlay-root`, so a double-click or control click is not misclassified as outside. `RichTextEditor` listens to `selectionUpdate` and closes the image popup only when the selected node is no longer the same image (same position and attachment ID). Selecting another image therefore transfers selection cleanly and closes the old popup.

## 10. Existing file actions that must remain intact

- Resize: pointer drag on `.image-resize-handle`, then `updateAttributes({ width })`.
- Caption/size/alignment/replace/open/reveal/remove: Image BubbleMenu actions.
- AttachmentBlock display mode/open/reveal/remove: its selected-node menu.
- Autosave: all document attribute changes go through Tiptap transactions and `onUpdate`.
- Legacy OS file drop: `App.handleDrop` imports paths or pasted image bytes through `storageService`.

## 11. Safe change rules for future AI agents

1. Do not create a second attachment record when moving/reusing an existing attachment.
2. Do not put physical paths in `DataTransfer`.
3. Do not replace the Tiptap schema, repository, storage service, or Rust commands for UI fixes.
4. Keep one controlled overlay state; do not add independent popup booleans.
5. Preserve `onUpdate` so autosave remains active.
6. When changing event propagation, test both text, NodeView, resize handle, menu controls, and OS file drops.
7. Keep existing dirty working-tree changes unless the user explicitly asks for a reset.

## 12. Verification commands

```powershell
npm.cmd run build
npx.cmd tsc --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
```

Manual smoke test: run `npm.cmd run tauri dev`, open a note in Edit mode, drag an image and a PDF from Attachments into several editor positions, single-click and double-click images, use Escape/outside click, switch images/notes, resize, caption, open/reveal/remove, then reload the note and verify content and attachment count.

## 13. Quiet Focus workspace state

The current workspace shell is split into `WorkspaceShell`, `Ribbon`, `FileExplorer`, `WorkspaceTabs`, and `EmptyTab`. `workspaceStore` persists tabs, active tab, sidebar visibility/width, active sidebar view, and `focusMode` in Tauri `workspace.json`; it does not write UI state into SQLite notes. Sidebar width is clamped to 220–440px.

Focus Mode is UI-only: `Ctrl+Shift+F` or the maximize button in the workspace tab bar toggles it, hiding the ribbon and file explorer while keeping the tab bar and editor available. Entering Focus Mode closes the global overlay and collapses metadata/attachments. Leaving it restores the prior sidebar visibility without touching note content. `Ctrl+Tab` advances tabs and `Ctrl+Shift+Tab` moves to the previous tab; tab switches/closures continue to flush pending note changes through the existing App helpers.

Quiet Focus design tokens live in `App.css` with semantic light/dark palettes and aliases retained for existing components. Theme selection supports Dark, Light, and System (System is the default when no preference is stored). The editor defaults to a compact 780px content width, metadata and Attachments are collapsed sections, and the save indicator is shown only while saving or after failure (not as a permanent “Saved” label).

## 14. File Explorer navigation and Trash

`src/features/sidebar/FileExplorer.tsx` owns explicit note navigation state through `SidebarView`: `all`, `favorites`, `trash`, `folder(folderId)`, and `unfiled`. This is separate from the workspace ribbon view type. App derives the visible list with deleted-aware filters: active notes exclude `deleted_at`, Trash includes only `deleted_at`, Favorites require active plus `is_favorite`, folders require active plus matching `folder_id`, and Unfiled requires active plus `folder_id === null`.

Trash is a one-click virtual view. It renders a flat deleted-note list and hides folder groups/Unfiled. Selecting a deleted note opens the existing tab immediately and renders a read-only Trash preview with restore/permanent-delete actions; no RichTextToolbar or document update path is mounted. Restore clears `deleted_at`, restores attachments, and falls back to Unfiled when the previous folder no longer exists. Permanent deletion confirms first, removes associated attachments through the existing storage service, closes tabs for the note, and opens the next available Trash note when one exists.

## 15. Attachment inspector

`NoteInspector` lives in `src/features/inspector/NoteInspector.tsx` and renders `AttachmentsPanel` without changing its loading, attachment repository, storage, drag payload, or Tiptap code. The workspace store persists `inspectorOpen` and `inspectorWidth` (280–440px; default 320px) in `workspace.json`. A paperclip button in the active note header toggles it and shows the attachment count; its focus is restored after Escape/close.

On wide windows the inspector occupies a real right-hand grid column. At widths under 1100px it switches to a resizable bottom drawer, preserving the editor above it. Internal attachment drag remains handled by the existing `AttachmentsPanel`/`RichTextEditor` flow. Tauri OS-file drops over `.note-inspector` import only into the current note; drops over the editor continue to import and insert at the document location.
