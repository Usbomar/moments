"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import { ViewerFavoriteButton } from "@/components/ViewerFavoriteButton";

interface Props {
  items: Asset[];
  onEditPhoto: (asset: Asset) => void;
  /** Obre el visor de pantalla completa amb aquest asset. */
  onOpenViewer?: (asset: Asset, contextItems: Asset[]) => void;
  onFavoriteToggle?: (asset: Asset, favorite: boolean) => void | Promise<void>;
}

export function SliderView({ items, onEditPhoto, onOpenViewer, onFavoriteToggle }: Props) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [speedMs, setSpeedMs] = useState(2400);
  const [fullscreen, setFullscreen] = useState(true);
  const [favBusy, setFavBusy] = useState(false);
  const itemsKeyRef = useRef<string>("");

  const itemsKey = useMemo(() => items.map((item) => item.id).join("|"), [items]);

  const current = useMemo(() => items[index] ?? null, [items, index]);

  useEffect(() => {
    if (itemsKeyRef.current === itemsKey) return;
    itemsKeyRef.current = itemsKey;
    queueMicrotask(() => setIndex(0));
  }, [itemsKey]);

  useEffect(() => {
    if (!playing || !items.length) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => {
        if (!shuffle || items.length < 3) return (prev + 1) % items.length;
        let next = prev;
        while (next === prev) {
          next = Math.floor(Math.random() * items.length);
        }
        return next;
      });
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [playing, speedMs, items.length, shuffle]);

  const goNext = useCallback(() => {
    setIndex((prev) => {
      if (!shuffle || items.length < 3) return (prev + 1) % items.length;
      let next = prev;
      while (next === prev) {
        next = Math.floor(Math.random() * items.length);
      }
      return next;
    });
  }, [items.length, shuffle]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!fullscreen) return;
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((prev) => !prev);
      } else if (event.key === "ArrowRight") {
        goNext();
      } else if (event.key === "ArrowLeft") {
        setIndex((prev) => (prev - 1 + items.length) % items.length);
      } else if (event.key === "Escape") {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, items.length, goNext]);

  if (!items.length) {
    return <p className="view-empty">No hi ha elements per al mode slider.</p>;
  }

  if (!current) return null;

  const btnClass = fullscreen ? "viewer-toolbar-btn" : undefined;
  const toolbarClass = fullscreen ? "viewer-toolbar slider-view-toolbar" : "controls slider-view-toolbar";

  return (
    <section
      className={fullscreen ? "viewer" : "view-panel"}
      onClick={() => setFullscreen(false)}
    >
      <div
        className={`slider-view-stack ${fullscreen ? "viewer-inner" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{ transition: "opacity 260ms ease, transform 260ms ease" }}
      >
        <div className="slider-view-media-box">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL signades / emmagatzematge */}
          <img
            className="viewer-media"
            src={(current.files.mediumUrl || current.files.previewUrl || current.files.originalUrl).trim()}
            alt={current.title}
            referrerPolicy="no-referrer"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            style={{ cursor: "pointer", display: "block" }}
            onClick={() => onEditPhoto(current)}
          />
        </div>
        <div className={toolbarClass} role="toolbar" aria-label="Controls del slider">
          <button
            type="button"
            className={btnClass}
            onClick={() => setIndex((prev) => (prev - 1 + items.length) % items.length)}
          >
            Anterior
          </button>
          <button type="button" className={btnClass} onClick={() => setPlaying((prev) => !prev)}>
            {playing ? "Pausa" : "Reprodueix"}
          </button>
          <button
            type="button"
            className={`${btnClass ?? "btn btn-sm"}${shuffle && fullscreen ? " viewer-toolbar-btn--active" : ""}`}
            aria-label={shuffle ? "Desactivar ordre aleatori" : "Activar ordre aleatori"}
            title={shuffle ? "Aleatori activat" : "Aleatori"}
            aria-pressed={shuffle}
            onClick={() => setShuffle((value) => !value)}
          >
            <span aria-hidden>🔀</span>
          </button>
          <button type="button" className={btnClass} onClick={goNext}>
            Següent
          </button>
          <ViewerFavoriteButton
            favorite={!!current.favorite}
            disabled={!onFavoriteToggle}
            busy={favBusy}
            onClick={() => {
              if (!onFavoriteToggle) return;
              const next = !current.favorite;
              setFavBusy(true);
              void Promise.resolve(onFavoriteToggle(current, next)).finally(() => setFavBusy(false));
            }}
          />
          {onOpenViewer ? (
            <button type="button" className={btnClass} onClick={() => onOpenViewer(current, items)}>
              Presentació
            </button>
          ) : null}
          <label className={fullscreen ? "slider-view-speed slider-view-speed--fs" : "slider-view-speed"}>
            <span>Interval</span>
            <select value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))}>
              <option value={1500}>1,5 s</option>
              <option value={2400}>2,4 s</option>
              <option value={4000}>4 s</option>
              <option value={6000}>6 s</option>
            </select>
          </label>
          {!fullscreen ? (
            <button type="button" className={btnClass} onClick={() => setFullscreen(true)}>
              Pantalla completa
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
