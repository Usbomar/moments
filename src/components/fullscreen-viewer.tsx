"use client";

import { useEffect, useState } from "react";
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

export function FullscreenViewer({ items, selectedId, onClose, onSelect, onEditDetails, onEditImage }: Props) {
  const index = items.findIndex((x) => x.id === selectedId);
  const current = index >= 0 ? items[index] : null;
  const [zoom, setZoom] = useState<1 | 2>(1);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setZoom(1));
    return () => window.cancelAnimationFrame(id);
  }, [selectedId]);

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

  const takenAtText = new Date(current.takenAt).toLocaleDateString("ca-ES", { day: "numeric", month: "long", year: "numeric" });
  const locationText = current.location ? `${current.location.city}${current.location.country ? `, ${current.location.country}` : ""}` : "";

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Visor de fotos a pantalla completa" onClick={onClose}>
      <div className="viewer-inner viewer-inner--framed" onClick={(e) => e.stopPropagation()}>
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
          // eslint-disable-next-line @next/next/no-img-element -- URL signades / emmagatzematge extern
          <img
            className={`viewer-media viewer-media--framed ${zoom === 2 ? "is-zoomed" : ""}`}
            src={previewUrl}
            alt={current.title}
            width={current.width || undefined}
            height={current.height || undefined}
            fetchPriority="high"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="viewer-media" style={placeholderStyle} role="img" aria-label="Imatge no disponible">
            <span style={{ fontWeight: 600, color: "var(--text, #151719)" }}>Imatge no disponible</span>
            <span style={{ wordBreak: "break-word", maxWidth: "100%" }}>{current.title}</span>
          </div>
        )}
        <div className="viewer-toolbar" role="toolbar" aria-label="Navegació i zoom">
          <button type="button" className="viewer-toolbar-btn" disabled={index <= 0} onClick={() => index > 0 && onSelect(items[index - 1].id)}>
            ←
          </button>
          <button type="button" className="viewer-toolbar-btn" onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}>
            {zoom === 1 ? "Zoom x2" : "Zoom x1"}
          </button>
          <button type="button" className="viewer-toolbar-btn" disabled={index >= items.length - 1} onClick={() => index < items.length - 1 && onSelect(items[index + 1].id)}>
            →
          </button>
          {onEditDetails || onEditImage ? (
            <span className="viewer-toolbar-icon-group" role="group" aria-label="Edició">
              {onEditDetails ? (
                <button
                  type="button"
                  className="viewer-toolbar-btn viewer-toolbar-icon-btn"
                  onClick={() => onEditDetails(current)}
                  aria-label="Editar informació de la foto"
                  title="Editar informació"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              ) : null}
              {onEditImage ? (
                <button
                  type="button"
                  className="viewer-toolbar-btn viewer-toolbar-icon-btn"
                  onClick={() => onEditImage(current)}
                  aria-label="Editar la imatge"
                  title="Editar imatge"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        <div className="viewer-caption-card viewer-caption-card--framed">
          <strong className="viewer-caption-title">{current.title}</strong>
          {current.description?.trim() ? <p className="viewer-caption-text">{current.description.trim()}</p> : null}
          <p className="viewer-caption-meta">
            {takenAtText}
            {locationText ? ` · ${locationText}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
