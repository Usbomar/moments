"use client";

import { useEffect, useMemo, useState } from "react";
import type { Asset } from "@/lib/types";

interface Props {
  items: Asset[];
}

export function SliderView({ items }: Props) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(2400);
  const [fullscreen, setFullscreen] = useState(true);

  const current = useMemo(() => items[index] ?? null, [items, index]);

  useEffect(() => {
    setIndex(0);
  }, [items]);

  useEffect(() => {
    if (!playing || !items.length) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [playing, speedMs, items.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!fullscreen) return;
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((prev) => !prev);
      } else if (event.key === "ArrowRight") {
        setIndex((prev) => (prev + 1) % items.length);
      } else if (event.key === "ArrowLeft") {
        setIndex((prev) => (prev - 1 + items.length) % items.length);
      } else if (event.key === "Escape") {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, items.length]);

  if (!items.length) {
    return <p style={{ color: "var(--muted)" }}>No hi ha elements per al mode slider.</p>;
  }

  if (!current) return null;

  return (
    <section
      className={fullscreen ? "viewer" : ""}
      style={fullscreen ? undefined : { border: "1px solid #ebedf0", borderRadius: 12, padding: 12, background: "#fff" }}
      onClick={() => setFullscreen(false)}
    >
      <div
        className={fullscreen ? "viewer-inner" : ""}
        onClick={(e) => e.stopPropagation()}
        style={{ transition: "opacity 260ms ease, transform 260ms ease" }}
      >
        <img className="viewer-media" src={current.files.previewUrl || current.files.originalUrl} alt={current.title} referrerPolicy="no-referrer" />
        <div className="controls" style={{ marginTop: 12, justifyContent: "center" }}>
          <button type="button" onClick={() => setIndex((prev) => (prev - 1 + items.length) % items.length)}>
            Prev
          </button>
          <button type="button" onClick={() => setPlaying((prev) => !prev)}>
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={() => setIndex((prev) => (prev + 1) % items.length)}>
            Next
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Speed
            <select value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))}>
              <option value={1500}>1.5s</option>
              <option value={2400}>2.4s</option>
              <option value={4000}>4s</option>
              <option value={6000}>6s</option>
            </select>
          </label>
          {!fullscreen ? (
            <button type="button" onClick={() => setFullscreen(true)}>
              Fullscreen
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
