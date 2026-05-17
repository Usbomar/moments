"use client";

import { useState } from "react";

export type GalleryView = "masonry" | "colors" | "collections" | "slider";

interface Props {
  value: GalleryView;
  onChange: (view: GalleryView) => void;
  /** Icones en fila (TopBar); per defecte menú desplegable. */
  variant?: "default" | "compact";
}

export const GALLERY_VIEW_STORAGE_KEY = "moments-view-preference";

const VALID_VIEWS: GalleryView[] = ["masonry", "colors", "collections", "slider"];

/** Llegeix la vista guardada (migra `timeline` → `masonry`). */
export function readGalleryViewPreference(): GalleryView {
  if (typeof window === "undefined") return "masonry";
  try {
    const raw = window.localStorage.getItem(GALLERY_VIEW_STORAGE_KEY);
    if (raw === "timeline") {
      window.localStorage.setItem(GALLERY_VIEW_STORAGE_KEY, "masonry");
      return "masonry";
    }
    if (raw && VALID_VIEWS.includes(raw as GalleryView)) return raw as GalleryView;
  } catch {
    /* ignore */
  }
  return "masonry";
}

const OPTIONS: Array<{ id: GalleryView; label: string; icon: string }> = [
  { id: "masonry", label: "Quadrícula", icon: "▦" },
  { id: "collections", label: "Col·leccions", icon: "▤" },
  { id: "colors", label: "Colors", icon: "⬤" },
  { id: "slider", label: "Presentació", icon: "▶" }
];

export function ViewSelector({ value, onChange, variant = "default" }: Props) {
  const [open, setOpen] = useState(false);

  if (variant === "compact") {
    return (
      <div className="view-selector-compact" role="group" aria-label="Tipus de vista de biblioteca">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`btn btn-sm view-selector-compact-btn ${value === option.id ? "btn-primary" : ""}`}
            title={option.label}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            <span aria-hidden>{option.icon}</span> <span>{option.label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((prev) => !prev)} aria-expanded={open} aria-haspopup="menu">
        Vistes
      </button>
      {open ? (
        <div className="card" style={{ position: "absolute", right: 0, zIndex: 15, marginTop: 6, padding: 8, minWidth: 190 }}>
          {OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={value === option.id ? "active" : ""}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", marginBottom: 6 }}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
            >
              <span aria-hidden>{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
