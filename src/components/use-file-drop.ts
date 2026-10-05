"use client";

import { useState, type DragEvent } from "react";

// Drag-and-drop for anything that takes a file: spread `bind` on the element that should accept the
// drop, show a highlight while `dragging`, and `onFiles` receives the dropped files.
export function useFileDrop(onFiles: (files: FileList) => void, disabled = false) {
  const [dragging, setDragging] = useState(false);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const bind = {
    onDragEnter: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragging(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
    },
  };
  return { dragging, bind };
}

export const DROP_RING = "outline-2 outline-dashed outline-amo-lime bg-amo-lime/10";
