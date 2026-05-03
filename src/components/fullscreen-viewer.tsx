"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import type { Asset } from "@/lib/types";

interface Props {
  items: Asset[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  /** Obre l’editor de metadades (títol, tags, ubicació, etc.). */
  onEditDetails: (asset: Asset) => void;
}

/** Matches library-grid placeholder look (gray gradient + centered text). */
const placeholderStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: 24,
  textAlign: "center",
  fontSize: 14,
  color: "var(--muted, #68707c)",
  background: "linear-gradient(145deg, #eef1f5, #f9fafb)",
  minHeight: "40vh",
  width: "100%",
  borderRadius: 12,
  boxSizing: "border-box"
};

export function FullscreenViewer({ items, selectedId, onClose, onSelect, onEditDetails }: Props) {
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

  const previewUrl = current.files.previewUrl?.trim() ?? "";

  return (
    <div className="viewer" onClick={onClose}>
      <div className="viewer-inner" onClick={(e) => e.stopPropagation()}>
        {previewUrl ? (
          <img
            className="viewer-media"
            src={previewUrl}
            alt={current.title}
            width={current.width || undefined}
            height={current.height || undefined}
            fetchPriority="high"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="viewer-media" style={placeholderStyle} role="img" aria-label="Image not available">
            <span style={{ fontWeight: 600, color: "var(--text, #151719)" }}>Image not available</span>
            <span style={{ wordBreak: "break-word", maxWidth: "100%" }}>{current.title}</span>
          </div>
        )}
        <div className="viewer-toolbar" role="toolbar" aria-label="Accions de la foto">
          <button type="button" className="viewer-toolbar-btn viewer-toolbar-btn--primary" onClick={() => onEditDetails(current)}>
            Editar dades
          </button>
          <button
            type="button"
            className="viewer-toolbar-btn"
            disabled
            title="Properament disponible"
            aria-label="Editar imatge (properament disponible)"
          >
            Editar imatge
          </button>
        </div>
      </div>
    </div>
  );
}
