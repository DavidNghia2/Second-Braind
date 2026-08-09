import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { closeDatabase } from "./database";
import { noteService } from "./noteService";
import { storageService } from "./storageService";
import type { Folder, Note, NotePatch, SaveState } from "./types";

export function useNotesStore() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const notesRef = useRef<Note[]>([]);
  const foldersRef = useRef<Folder[]>([]);
  const dirtyRef = useRef(new Map<string, number>());
  const revisionRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const queueRef = useRef(Promise.resolve());
  const selectedIdRef = useRef<string | null>(null);
  const closingRef = useRef(false);

  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { foldersRef.current = folders; }, [folders]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const refresh = useCallback(async (selectLatest = false) => {
    const [rows, folderRows] = await Promise.all([noteService.list(), noteService.listFolders()]);
    notesRef.current = rows;
    foldersRef.current = folderRows;
    setNotes(rows);
    setFolders(folderRows);
    if (selectLatest && rows[0]) {
      setSelectedId(rows.find((note) => !note.deleted_at)?.id ?? null);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    refresh(true).catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : "Could not load the workspace";
      setError(message);
      void noteService.logError(`load: ${message}`);
      setReady(true);
    });
  }, [refresh]);

  const flush = useCallback(async (id: string) => {
    const current = notesRef.current.find((note) => note.id === id);
    const revision = revisionRef.current.get(id) ?? 0;
    if (!current || !dirtyRef.current.has(id)) return true;
    const snapshot = { ...current };
    queueRef.current = queueRef.current.catch(() => undefined).then(async () => {
      if (selectedIdRef.current === id) setSaveState("saving");
      try {
        const saved = await noteService.update(snapshot);
        if ((revisionRef.current.get(id) ?? 0) === revision) {
          dirtyRef.current.delete(id);
          notesRef.current = notesRef.current.map((note) => note.id === id ? saved : note);
          setNotes(notesRef.current);
          if (selectedIdRef.current === id) setSaveState("saved");
        }
      } catch (cause: unknown) {
        const message = cause instanceof Error ? cause.message : "Could not save the note";
        setError(message);
        if (selectedIdRef.current === id) setSaveState("failed");
        void noteService.logError(`save ${id}: ${message}`);
        throw cause;
      }
    });
    try {
      await queueRef.current;
      return true;
    } catch {
      return false;
    }
  }, []);

  const schedule = useCallback((id: string) => {
    const previous = timersRef.current.get(id);
    if (previous) clearTimeout(previous);
    timersRef.current.set(id, setTimeout(() => {
      timersRef.current.delete(id);
      void flush(id);
    }, 700));
  }, [flush]);

  const updateSelected = useCallback((patch: NotePatch) => {
    const id = selectedIdRef.current;
    if (!id) return;
    const revision = (revisionRef.current.get(id) ?? 0) + 1;
    revisionRef.current.set(id, revision);
    dirtyRef.current.set(id, revision);
    notesRef.current = notesRef.current.map((note) => note.id === id ? { ...note, ...patch } : note);
    setNotes(notesRef.current);
    setSaveState("editing");
    setError(null);
    schedule(id);
  }, [schedule]);

  const updateNote = useCallback((id: string, patch: NotePatch) => {
    const current = notesRef.current.find((note) => note.id === id);
    if (!current) return;
    const revision = (revisionRef.current.get(id) ?? 0) + 1;
    revisionRef.current.set(id, revision);
    dirtyRef.current.set(id, revision);
    notesRef.current = notesRef.current.map((note) => note.id === id ? { ...note, ...patch } : note);
    setNotes(notesRef.current);
    if (selectedIdRef.current === id) {
      setSaveState("editing");
      setError(null);
    }
    schedule(id);
  }, [schedule]);

  const selectNote = useCallback(async (id: string | null) => {
    const previous = selectedIdRef.current;
    if (previous && previous !== id) {
      const timer = timersRef.current.get(previous);
      if (timer) clearTimeout(timer);
      timersRef.current.delete(previous);
      await flush(previous);
    }
    setSelectedId(id);
    setSaveState("saved");
  }, [flush]);

  const create = useCallback(async (folderId: string | null = null) => {
    const previous = selectedIdRef.current;
    if (previous) {
      const timer = timersRef.current.get(previous);
      if (timer) clearTimeout(timer);
      timersRef.current.delete(previous);
      await flush(previous);
    }
    const note = await noteService.create(folderId);
    notesRef.current = [note, ...notesRef.current];
    setNotes(notesRef.current);
    setSelectedId(note.id);
    selectedIdRef.current = note.id;
    setSaveState("saved");
    return note;
  }, [flush]);

  const moveNoteToFolder = useCallback(async (id: string, folderId: string | null) => {
    const current = notesRef.current.find((note) => note.id === id);
    if (!current || current.folder_id === folderId) return current ?? null;
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    if (!await flush(id)) throw new Error("Could not save the note before moving it");
    const saved = await noteService.patch(id, { folder_id: folderId });
    if (!saved) throw new Error("Note not found");
    notesRef.current = notesRef.current.map((note) => note.id === id ? saved : note);
    setNotes(notesRef.current);
    return saved;
  }, [flush]);

  const flushAll = useCallback(async () => {
    let succeeded = true;
    for (const id of dirtyRef.current.keys()) {
      if (!await flush(id)) succeeded = false;
    }
    return succeeded;
  }, [flush]);

  const removeFromTrash = useCallback(async (id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    if (!await flush(id)) throw new Error("Could not save the note before moving it to Trash");
    await noteService.moveToTrashWithAttachments(id);
    dirtyRef.current.delete(id);
    await refresh();
    if (selectedIdRef.current === id) await selectNote(null);
  }, [flush, refresh, selectNote]);

  const restore = useCallback(async (id: string) => {
    const deletedNote = notesRef.current.find((note) => note.id === id);
    const originalFolderStillExists = !deletedNote?.folder_id || foldersRef.current.some((folder) => folder.id === deletedNote.folder_id && !folder.deleted_at);
    await noteService.restoreWithAttachments(id);
    if (!originalFolderStillExists) await noteService.patch(id, { folder_id: null });
    await refresh();
    return notesRef.current.find((note) => note.id === id) ?? null;
  }, [refresh]);

  const removeFolderTree = useCallback(async (id: string) => {
    if (!await flushAll()) throw new Error("Could not save notes before moving the folder to Trash");
    await noteService.removeFolder(id);
    await refresh();
  }, [flushAll, refresh]);

  const restoreFolderTree = useCallback(async (id: string) => {
    await noteService.restoreFolderTree(id);
    await refresh();
  }, [refresh]);
  const permanentlyDelete = useCallback(async (id: string) => {
    const orphaned = await noteService.permanentlyDelete(id);
    for (const attachment of orphaned) {
      await storageService.removePhysical(attachment).catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        void noteService.logError(`attachment cleanup ${attachment.id}: ${message}`);
      });
    }
    dirtyRef.current.delete(id);
    await refresh();
    if (selectedIdRef.current === id) await selectNote(null);
  }, [refresh, selectNote]);
  const permanentlyDeleteFolderTree = useCallback(async (id: string) => {
    const orphaned = await noteService.permanentlyDeleteFolderTree(id);
    for (const attachment of orphaned) await storageService.removePhysical(attachment).catch(() => undefined);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const window = getCurrentWindow();
    void window.onCloseRequested(async (event) => {
      if (closingRef.current) return;
      event.preventDefault();
      const ok = await flushAll();
      if (ok) {
        closingRef.current = true;
        await closeDatabase().catch(() => undefined);
        await invoke("exit_app").catch(() => {
          closingRef.current = false;
          setError("Could not close the application safely");
        });
      }
    }).then((dispose) => { unlisten = dispose; }).catch(() => undefined);
    return () => { unlisten?.(); };
  }, [flushAll]);

  const retrySave = useCallback(async () => {
    if (selectedIdRef.current) {
      setError(null);
      await flush(selectedIdRef.current);
    }
  }, [flush]);

  return {
    notes, folders, selectedId, selected: notes.find((note) => note.id === selectedId) ?? null,
    saveState, error, ready, refresh, create, selectNote, updateSelected, updateNote, flush, flushAll,
    removeFromTrash, restore, permanentlyDelete, permanentlyDeleteFolderTree, retrySave, setError, setFolders, moveNoteToFolder, removeFolderTree, restoreFolderTree,
  };
}
