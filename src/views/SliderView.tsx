"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import type { SliderTransition } from "@/lib/grid-library";
import { ViewerFavoriteButton } from "@/components/ViewerFavoriteButton";

const SLIDER_TRANSITION_MS = 450;

interface Props {
  items: Asset[];
  transition: SliderTransition;
  onEditPhoto: (asset: Asset) => void;
  /** Obre el visor de pantalla completa amb aquest asset. */
  onOpenViewer?: (asset: Asset, contextItems: Asset[]) => void;
  onFavoriteToggle?: (asset: Asset, favorite: boolean) => void | Promise<void>;
}

export function SliderView({ items, transition, onEditPhoto, onOpenViewer, onFavoriteToggle }: Props) {
  const [index, setIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [speedMs, setSpeedMs] = useState(2400);
  const [fullscreen, setFullscreen] = useState(true);
  const [favBusy, setFavBusy] = useState(false);
  const itemsKeyRef = useRef<string>("");
  const busyRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);

  const itemsKey = useMemo(() => items.map((item) => item.id).join("|"), [items]);

  const current = useMemo(() => items[index] ?? null, [items, index]);
  const previous = previousIndex != null ? items[previousIndex] ?? null : null;

  useEffect(() => {
    if (itemsKeyRef.current === itemsKey) return;
    itemsKeyRef.current = itemsKey;
    queueMicrotask(() => {
      setPreviousIndex(null);
      busyRef.current = false;
      setIndex(0);
    });
  }, [itemsKey]);

  const goToIndex = useCallback(
    (nextRaw: number) => {
      if (busyRef.current || items.length < 1) return;
      const next = ((nextRaw % items.length) + items.length) % items.length;
      if (next === index) return;
      busyRef.current = true;
      setPreviousIndex(index);
      setIndex(next);
      window.setTimeout(() => {
        setPreviousIndex(null);
        busyRef.current = false;
      }, SLIDER_TRANSITION_MS);
    },
    [index, items.length]
  );

  const goNext = useCallback(() => {
    if (!shuffle || items.length < 3) {
      goToIndex(index + 1);
      return;
    }
    let next = index;
    while (next === index) {
      next = Math.floor(Math.random() * items.length);
    }
    goToIndex(next);
  }, [goToIndex, index, items.length, shuffle]);

  const goPrev = useCallback(() => {
    goToIndex(index - 1);
  }, [goToIndex, index]);

  useEffect(() => {
    if (!playing || !items.length) return;
    const timer = window.setInterval(() => {
      goNext();
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [playing, speedMs, items.length, goNext]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!fullscreen) return;
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((prev) => !prev);
      } else if (event.key === "ArrowRight") {
        goNext();
      } else if (event.key === "ArrowLeft") {
        goPrev();
      } else if (event.key === "Escape") {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, goNext, goPrev]);

  const toggleBrowserFullscreen = useCallback(() => {
    setFullscreen(true);
    const el = sectionRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    void el.requestFullscreen?.();
  }, []);

  if (!items.length) {
    return <p className="view-empty">No hi ha elements per al mode slider.</p>;
  }

  if (!current) return null;

  const btnClass = fullscreen ? "viewer-toolbar-btn" : undefined;
  const toolbarClass = fullscreen ? "viewer-toolbar slider-view-toolbar" : "controls slider-view-toolbar";
  const currentSrc = (current.files.mediumUrl || current.files.previewUrl || current.files.originalUrl).trim();
  const previousSrc = previous ? (previous.files.mediumUrl || previous.files.previewUrl || previous.files.originalUrl).trim() : "";

  return (
    <section
      ref={sectionRef}
      className={fullscreen ? "viewer" : "view-panel"}
      onClick={() => setFullscreen(false)}
    >
      <div
        className={`slider-view-stack ${fullscreen ? "viewer-inner" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{ transition: "opacity 260ms ease, transform 260ms ease" }}
      >
        <div className={`slider-view-media-box slider-view-media-box--transition-${transition}`}>
          {previous && previousSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL signades / emmagatzematge
            <img
              key={`previous-${previous.id}`}
              className={`viewer-media slider-view-media slider-view-media--previous slider-view-media--previous-${transition}`}
              src={previousSrc}
              alt=""
              aria-hidden
              referrerPolicy="no-referrer"
              decoding="async"
            />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element -- URL signades / emmagatzematge */}
          <img
            key={`current-${current.id}`}
            className={`viewer-media slider-view-media slider-view-media--current slider-view-media--current-${transition}`}
            src={currentSrc}
            alt={current.title}
            referrerPolicy="no-referrer"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onClick={() => onEditPhoto(current)}
          />
        </div>
        <div className={toolbarClass} role="toolbar" aria-label="Controls del slider">
          <button
            type="button"
            className={btnClass}
            onClick={goPrev}
          >
            Anterior
          </button>
          <button type="button" className={btnClass} onClick={() => setPlaying((prev) => !prev)}>
            {playing ? "Pausa" : "Reprodueix"}
          </button>
          <button
            type="button"
            className={`${btnClass ?? "btn btn-sm"} viewer-toolbar-btn--icon viewer-toolbar-btn--shuffle${shuffle && fullscreen ? " viewer-toolbar-btn--active" : ""}`}
            aria-label={shuffle ? "Desactivar ordre aleatori" : "Activar ordre aleatori"}
            title={shuffle ? "Aleatori activat" : "Aleatori"}
            aria-pressed={shuffle}
            onClick={() => setShuffle((value) => !value)}
          >
            <span className="viewer-icon viewer-icon-shuffle" aria-hidden />
          </button>
          <button
            type="button"
            className={`${btnClass ?? "btn btn-sm"} viewer-toolbar-btn--icon`}
            aria-label="Pantalla completa"
            title="Pantalla completa"
            onClick={toggleBrowserFullscreen}
          >
            <span className="viewer-icon viewer-icon-fullscreen" aria-hidden />
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
        </div>
      </div>
    </section>
  );
}
