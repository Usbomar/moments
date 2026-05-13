"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import type { CollectionMusicTrack } from "@/lib/collection-music";
import type { SliderTransition } from "@/lib/grid-library";
import { ViewerFavoriteButton } from "@/components/ViewerFavoriteButton";

const FADE_MS = 450;

type Props = {
  items: Asset[];
  onClose: () => void;
  onEditDetails?: (asset: Asset) => void;
  /** Commuta preferit (mateix flux que la biblioteca). */
  onFavoriteToggle?: (asset: Asset, favorite: boolean) => void | Promise<void>;
  musicTrack?: CollectionMusicTrack | null;
  transition: SliderTransition;
  /** Temps que cada foto resta visible (després del fade d’entrada, abans del següent fos) */
  dwellMs?: number;
};

function urlFor(asset: Asset): string {
  return (asset.files.mediumUrl || asset.files.previewUrl || asset.files.originalUrl).trim();
}

/**
 * Presentació a pantalla completa amb crossfade entre imatges i música local opcional.
 */
export function FadingSlideshow({ items, onClose, onEditDetails, onFavoriteToggle, musicTrack, transition, dwellMs = 2800 }: Props) {
  const [index, setIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [musicSrc, setMusicSrc] = useState<string | null>(() => musicTrack?.url ?? null);
  const [musicName, setMusicName] = useState<string | null>(() => musicTrack?.title ?? null);
  const [musicPlaying, setMusicPlaying] = useState(() => !!musicTrack?.url);
  const [musicVolume, setMusicVolume] = useState(0.42);
  const busyRef = useRef(false);
  const indexRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const musicSrcRef = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const n = items.length;
  const current = n > 0 ? items[Math.min(index, n - 1)] : null;
  const previous = previousIndex != null && n > 0 ? items[Math.min(previousIndex, n - 1)] : null;
  const itemsKey = useMemo(() => items.map((i) => i.id).join("|"), [items]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setIndex(0);
      indexRef.current = 0;
      setPreviousIndex(null);
      busyRef.current = false;
      setPlaying(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [itemsKey]);

  useEffect(() => {
    return () => {
      if (musicSrcRef.current) {
        URL.revokeObjectURL(musicSrcRef.current);
        musicSrcRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = musicVolume;
  }, [musicVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !musicSrc) return;

    if (!musicPlaying) {
      audio.pause();
      return;
    }

    void audio.play().catch(() => {
      setMusicPlaying(false);
    });
  }, [musicPlaying, musicSrc]);

  const goToIndex = useCallback(
    (nextRaw: number) => {
      if (busyRef.current || n < 1) return;
      const next = ((nextRaw % n) + n) % n;
      if (next === indexRef.current) return;
      busyRef.current = true;
      setPreviousIndex(indexRef.current);
      setIndex(next);
      indexRef.current = next;
      window.setTimeout(() => {
        setPreviousIndex(null);
        busyRef.current = false;
      }, FADE_MS);
    },
    [n]
  );

  const goNext = useCallback(() => {
    if (!shuffle || n < 3) {
      goToIndex(indexRef.current + 1);
      return;
    }
    let next = indexRef.current;
    while (next === indexRef.current) {
      next = Math.floor(Math.random() * n);
    }
    goToIndex(next);
  }, [goToIndex, n, shuffle]);

  const togglePlayback = useCallback(() => {
    setPlaying((currentPlaying) => {
      const nextPlaying = !currentPlaying;
      if (musicSrcRef.current) setMusicPlaying(nextPlaying);
      return nextPlaying;
    });
  }, []);

  useEffect(() => {
    if (!playing || n < 2) return;
    const cycleMs = dwellMs + 2 * FADE_MS;
    const id = window.setInterval(() => {
      if (busyRef.current) return;
      goNext();
    }, cycleMs);
    return () => window.clearInterval(id);
  }, [playing, n, dwellMs, goNext]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToIndex(indexRef.current - 1);
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goToIndex, goNext, togglePlayback]);

  const handleMusicPick = useCallback((file: File | undefined) => {
    if (!file) return;
    if (musicSrcRef.current) URL.revokeObjectURL(musicSrcRef.current);
    const nextSrc = URL.createObjectURL(file);
    musicSrcRef.current = nextSrc;
    setMusicSrc(nextSrc);
    setMusicName(file.name);
    setMusicPlaying(true);
  }, []);

  const clearMusic = useCallback(() => {
    const audio = audioRef.current;
    audio?.pause();
    if (musicSrcRef.current) URL.revokeObjectURL(musicSrcRef.current);
    musicSrcRef.current = null;
    setMusicSrc(null);
    setMusicName(null);
    setMusicPlaying(false);
    if (musicInputRef.current) musicInputRef.current.value = "";
  }, []);

  const requestBrowserFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    void el.requestFullscreen?.();
  }, []);

  if (!current || n < 1) return null;

  const src = urlFor(current);
  const previousSrc = previous ? urlFor(previous) : "";
  const label = `${index + 1} / ${n}`;

  return (
    <div
      ref={rootRef}
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
            {previous && previousSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL signades
              <img
                key={`previous-${previous.id}`}
                className={`fading-slideshow-img fading-slideshow-img--previous fading-slideshow-img--previous-${transition}`}
                src={previousSrc}
                alt=""
                aria-hidden
                referrerPolicy="no-referrer"
                decoding="async"
              />
            ) : null}
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL signades
              <img
                key={`current-${current.id}`}
                className={`fading-slideshow-img fading-slideshow-img--current fading-slideshow-img--current-${transition}`}
                src={src}
                alt={current.title}
                referrerPolicy="no-referrer"
                decoding="async"
                fetchPriority="high"
              />
            ) : (
              <div className="fading-slideshow-placeholder">{current.title}</div>
            )}
          </div>
        </div>

        <div className="viewer-toolbar fading-slideshow-toolbar" role="toolbar" aria-label="Controls de la presentació">
          <button type="button" className="viewer-toolbar-btn" onClick={() => goToIndex(indexRef.current - 1)} disabled={n < 2}>
            Anterior
          </button>
          <button type="button" className="viewer-toolbar-btn viewer-toolbar-btn--primary" onClick={togglePlayback}>
            {playing ? "Pausa" : "Reprodueix"}
          </button>
          <button
            type="button"
            className={`viewer-toolbar-btn viewer-toolbar-btn--icon viewer-toolbar-btn--shuffle${shuffle ? " viewer-toolbar-btn--active" : ""}`}
            aria-label={shuffle ? "Desactivar ordre aleatori" : "Activar ordre aleatori"}
            title={shuffle ? "Aleatori activat" : "Aleatori"}
            aria-pressed={shuffle}
            onClick={() => setShuffle((value) => !value)}
          >
            <span className="viewer-icon viewer-icon-shuffle" aria-hidden />
          </button>
          <button
            type="button"
            className="viewer-toolbar-btn viewer-toolbar-btn--icon"
            aria-label="Pantalla completa"
            title="Pantalla completa"
            onClick={requestBrowserFullscreen}
          >
            <span className="viewer-icon viewer-icon-fullscreen" aria-hidden />
          </button>
          <button type="button" className="viewer-toolbar-btn" onClick={goNext} disabled={n < 2}>
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

        <div className="fading-slideshow-music" aria-label="Música de la presentació">
          <audio
            ref={audioRef}
            src={musicSrc ?? undefined}
            loop
            onEnded={() => setMusicPlaying(false)}
            onPlay={() => setMusicPlaying(true)}
            onPause={() => setMusicPlaying(false)}
          />
          <input
            ref={musicInputRef}
            className="fading-slideshow-music-input"
            type="file"
            accept="audio/*"
            onChange={(e) => handleMusicPick(e.target.files?.[0])}
          />
          <button type="button" className="viewer-toolbar-btn" onClick={() => musicInputRef.current?.click()}>
            {musicName ? "Canviar música" : "Afegir música"}
          </button>
          {musicSrc ? (
            <>
              <button type="button" className="viewer-toolbar-btn" onClick={() => setMusicPlaying((v) => !v)}>
                {musicPlaying ? "Pausar música" : "Reprendre música"}
              </button>
              <label className="fading-slideshow-volume">
                <span>Volum</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(Number(e.target.value))}
                />
              </label>
              <button type="button" className="viewer-toolbar-btn viewer-toolbar-btn--subtle" onClick={clearMusic}>
                Treure música
              </button>
            </>
          ) : null}
          {musicName ? <span className="fading-slideshow-track" title={musicName}>{musicName}</span> : null}
        </div>
      </div>
    </div>
  );
}
