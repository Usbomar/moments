"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import { ViewerFavoriteButton } from "@/components/ViewerFavoriteButton";

const FADE_MS = 450;

type Props = {
  items: Asset[];
  onClose: () => void;
  onEditDetails?: (asset: Asset) => void;
  /** Commuta preferit (mateix flux que la biblioteca). */
  onFavoriteToggle?: (asset: Asset, favorite: boolean) => void | Promise<void>;
  /** Temps que cada foto resta visible (després del fade d’entrada, abans del següent fos) */
  dwellMs?: number;
};

function urlFor(asset: Asset): string {
  return (asset.files.mediumUrl || asset.files.previewUrl || asset.files.originalUrl).trim();
}

/**
 * Presentació a pantalla completa amb fos a negre entre imatges (estil “ken burns” lleuger només en opacitat).
 */
export function FadingSlideshow({ items, onClose, onEditDetails, onFavoriteToggle, dwellMs = 2800 }: Props) {
  const [index, setIndex] = useState(0);
  const [veilOn, setVeilOn] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [favBusy, setFavBusy] = useState(false);
  const busyRef = useRef(false);
  const indexRef = useRef(0);

  const n = items.length;
  const current = n > 0 ? items[Math.min(index, n - 1)] : null;
  const itemsKey = useMemo(() => items.map((i) => i.id).join("|"), [items]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setIndex(0);
      indexRef.current = 0;
      setVeilOn(false);
      busyRef.current = false;
      setPlaying(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [itemsKey]);

  const goToIndex = useCallback(
    (nextRaw: number) => {
      if (busyRef.current || n < 1) return;
      const next = ((nextRaw % n) + n) % n;
      if (next === indexRef.current) return;
      busyRef.current = true;
      setVeilOn(true);
      window.setTimeout(() => {
        setIndex(next);
        indexRef.current = next;
        window.requestAnimationFrame(() => {
          setVeilOn(false);
          window.setTimeout(() => {
            busyRef.current = false;
          }, FADE_MS);
        });
      }, FADE_MS);
    },
    [n]
  );

  useEffect(() => {
    if (!playing || n < 2) return;
    const cycleMs = dwellMs + 2 * FADE_MS;
    const id = window.setInterval(() => {
      if (busyRef.current) return;
      goToIndex(indexRef.current + 1);
    }, cycleMs);
    return () => window.clearInterval(id);
  }, [playing, n, dwellMs, goToIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToIndex(indexRef.current + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToIndex(indexRef.current - 1);
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goToIndex]);

  if (!current || n < 1) return null;

  const src = urlFor(current);
  const label = `${index + 1} / ${n}`;

  return (
    <div
      className="fading-slideshow"
      role="dialog"
      aria-modal="true"
      aria-label="Presentació de la col·lecció"
      onClick={onClose}
    >
      <div className="fading-slideshow-inner" onClick={(e) => e.stopPropagation()}>
        <header className="fading-slideshow-top">
          <span className="fading-slideshow-counter" aria-live="polite">
            {label}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            <button type="button" className="viewer-toolbar-btn" onClick={onClose} aria-label="Tancar presentació">
              ×
            </button>
          </div>
        </header>

        <div className="fading-slideshow-stage">
          <div className="fading-slideshow-img-wrap">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL signades
              <img
                key={current.id}
                className="fading-slideshow-img"
                src={src}
                alt={current.title}
                referrerPolicy="no-referrer"
                decoding="async"
                fetchPriority="high"
              />
            ) : (
              <div className="fading-slideshow-placeholder">{current.title}</div>
            )}
            <div className={`fading-slideshow-veil${veilOn ? " fading-slideshow-veil--on" : ""}`} aria-hidden />
          </div>
        </div>

        <div className="viewer-toolbar fading-slideshow-toolbar" role="toolbar" aria-label="Controls de la presentació">
          <button type="button" className="viewer-toolbar-btn" onClick={() => goToIndex(indexRef.current - 1)} disabled={n < 2}>
            Anterior
          </button>
          <button type="button" className="viewer-toolbar-btn viewer-toolbar-btn--primary" onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pausa" : "Reprodueix"}
          </button>
          <button type="button" className="viewer-toolbar-btn" onClick={() => goToIndex(indexRef.current + 1)} disabled={n < 2}>
            Següent
          </button>
          {onEditDetails ? (
            <button
              type="button"
              className="viewer-toolbar-btn"
              onClick={() => {
                const a = current;
                onClose();
                queueMicrotask(() => onEditDetails(a));
              }}
            >
              Editar dades
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
