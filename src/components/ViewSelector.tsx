"use client";

import { useEffect, useRef, useState } from "react";

export type GalleryView = "masonry" | "map" | "timeline" | "colors" | "slider";

interface Props {
  value: GalleryView;
  onChange: (view: GalleryView) => void;
}

const STORAGE_KEY = "moments-view-preference";

const OPTIONS: Array<{ id: GalleryView; label: string; icon: string }> = [
  { id: "masonry", label: "Masonry", icon: "📊" },
  { id: "map", label: "Map", icon: "🗺️" },
  { id: "timeline", label: "Timeline", icon: "📅" },
  { id: "colors", label: "Colors", icon: "🌈" },
  { id: "slider", label: "Slider", icon: "▶️" }
];

export function ViewSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const stored = window.localStorage.getItem(STORAGE_KEY) as GalleryView | null;
    if (stored && OPTIONS.some((item) => item.id === stored) && stored !== value) {
      onChange(stored);
    }
  }, [onChange, value]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, value);
  }, [value]);

  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((prev) => !prev)} aria-expanded={open} aria-haspopup="menu">
        Views
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
