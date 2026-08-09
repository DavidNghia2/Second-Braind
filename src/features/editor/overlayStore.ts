import { useSyncExternalStore } from "react";

let activeOverlay: string | null = null;
const listeners = new Set<() => void>();

export const imageBubbleMenuPluginKey = "imageBubbleMenu";

export const overlayStore = {
  get: () => activeOverlay,
  set: (next: string | null) => {
    if (activeOverlay === next) return;
    activeOverlay = next;
    listeners.forEach((listener) => listener());
  },
  toggle: (id: string) => overlayStore.set(activeOverlay === id ? null : id),
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useActiveOverlay = () => useSyncExternalStore(overlayStore.subscribe, overlayStore.get, overlayStore.get);

export type ImageOverlay = { attachmentId: string; position: number; more: boolean };

export const imageOverlayId = (attachmentId: string, position: number, more = false) =>
  `${more ? "image-more" : "image"}:${position}:${encodeURIComponent(attachmentId)}`;

export const parseImageOverlay = (value: string | null): ImageOverlay | null => {
  if (!value) return null;
  const match = /^(image|image-more):(\d+):(.+)$/.exec(value);
  if (!match) return null;
  const position = Number(match[2]);
  if (!Number.isSafeInteger(position)) return null;
  try {
    return { attachmentId: decodeURIComponent(match[3]), position, more: match[1] === "image-more" };
  } catch {
    return null;
  }
};
