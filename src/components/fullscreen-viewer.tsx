"use client";

import Image from "next/image";
import { useEffect } from "react";
import type { Asset } from "@/lib/types";

interface Props {
  items: Asset[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function FullscreenViewer({ items, selectedId, onClose, onSelect }: Props) {
  const index = items.findIndex((x) => x.id === selectedId);
  const current = index >= 0 ? items[index] : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!current) return;
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onSelect(items[index - 1].id);
      if (event.key === "ArrowRight" && index < items.length - 1) onSelect(items[index + 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, index, items, onClose, onSelect]);

  if (!current) return null;

  return (
    <div className="viewer" onClick={onClose}>
      <div className="viewer-inner" onClick={(e) => e.stopPropagation()}>
        <Image
          className="viewer-media"
          src={current.files.previewUrl}
          alt={current.title}
          width={current.width}
          height={current.height}
          priority
        />
      </div>
    </div>
  );
}
