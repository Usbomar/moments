"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import type { Asset } from "@/lib/types";

interface Props {
  items: Asset[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEditDetails?: (asset: Asset) => void;
  onEditImage?: (asset: Asset) => void;
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

  const previewUrl = (current.files.mediumUrl || current.files.previewUrl)?.trim() ?? "";

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Visor de fotos a pantalla completa" onClick={onClose}>
      <div className="viewer-inner" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="viewer-close"
          onClick={onClose}
          aria-label="Tancar visor"
          title="Tancar"
        >
          ×
        </button>
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
        <div className="viewer-caption-card">
          <strong className="viewer-caption-title">{current.title}</strong>
          {current.description?.trim() ? <p className="viewer-caption-text">{current.description.trim()}</p> : null}
          <p className="viewer-caption-meta">
            {new Date(current.takenAt).toLocaleDateString("ca-ES", { day: "numeric", month: "long", year: "numeric" })}
            {current.location ? ` · ${current.location.city}, ${current.location.country}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
