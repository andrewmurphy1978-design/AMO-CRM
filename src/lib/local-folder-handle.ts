"use client";

// The computer's root folder, picked once in Settings, is remembered in this browser (IndexedDB).
type Perm = "granted" | "denied" | "prompt";
export interface DirHandle extends FileSystemDirectoryHandle {
  queryPermission(d: { mode: "readwrite" }): Promise<Perm>;
  requestPermission(d: { mode: "readwrite" }): Promise<Perm>;
}

const DB = "amo-local-folder";
const KEY = "root";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("handles");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const folderPickerSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

export async function loadRootHandle(): Promise<DirHandle | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction("handles").objectStore("handles").get(KEY);
      req.onsuccess = () => resolve((req.result as DirHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function pickRootHandle(): Promise<DirHandle | null> {
  if (!folderPickerSupported()) return null;
  try {
    const handle = (await (window as unknown as { showDirectoryPicker: (o: { mode: "readwrite" }) => Promise<DirHandle> }).showDirectoryPicker({ mode: "readwrite" }));
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(handle, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return handle;
  } catch {
    return null; // cancelled
  }
}

// Creates every pending folder under the root folder, then tells the CRM which ones exist.
export async function createPendingFolders(root: DirHandle): Promise<{ created: number; failed: number }> {
  const res = await fetch("/api/local-folders", { cache: "no-store" });
  if (!res.ok) return { created: 0, failed: 0 };
  const { items } = (await res.json()) as { items: { kind: "contact" | "project"; id: string; segments: string[] }[] };
  const contactIds: string[] = [];
  const projectIds: string[] = [];
  let failed = 0;
  for (const item of items) {
    try {
      let dir: FileSystemDirectoryHandle = root;
      for (const name of item.segments) dir = await dir.getDirectoryHandle(name, { create: true });
      (item.kind === "contact" ? contactIds : projectIds).push(item.id);
    } catch {
      failed++;
    }
  }
  if (contactIds.length + projectIds.length > 0) {
    await fetch("/api/local-folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactIds, projectIds }) });
  }
  return { created: contactIds.length + projectIds.length, failed };
}
