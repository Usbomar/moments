"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Asset } from "@/lib/types";
import type { CollectionMusicTrack } from "@/lib/collection-music";
import type { SliderTransition } from "@/lib/grid-library";
import { ViewerFavoriteButton } from "@/components/ViewerFavoriteButton";

const BASE_FADE_MS = 450;
const CHROME_HIDE_DELAY_MS = 600;

export const SLIDESHOW_SPEEDS = [0.5, 1, 1.25, 1.5, 1.75, 2] as const;
export type SlideshowSpeed = (typeof SLIDESHOW_SPEEDS)[number];

type Props = {
  items: Asset[];
  onClose: () => void;
  onEditDetails?: (asset: Asset) => void;
  onFavoriteToggle?: (asset: Asset, favorite: boolean) => void | Promise<void>;
  musicTrack?: CollectionMusicTrack | null;
  transition: SliderTransition;
  dwellMs?: number;
};

/** Foto principal: proporció original; thumb només si no hi ha res millor. */
function displayUrlFor(asset: Asset): string {
  return (
    asset.files.mediumUrl ||
    asset.files.previewUrl ||
    asset.files.originalUrl ||
    asset.files.thumbUrl
  ).trim();
}

/** Filmstrip: miniatures compactes. */
function thumbUrlFor(asset: Asset): string {
  return (asset.files.thumbUrl || asset.files.mediumUrl || asset.files.previewUrl || asset.files.originalUrl).trim();
}

export function FadingSlideshow({ items, onClose, onEditDetails, onFavoriteToggle, musicTrack, transition, dwellMs = 2800 }: Props) {
  const [index, setIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [speed, setSpeed] = useState<SlideshowSpeed>(1);
  const [chromeRevealed, setChromeRevealed] = useState(false);
  const fadeMs = useMemo(() => Math.max(120, Math.round(BASE_FADE_MS / speed)), [speed]);
  const effectiveDwellMs = useMemo(() => Math.max(500, Math.round(dwellMs / speed)), [dwellMs, speed]);
  const transitionStyle = useMemo(
    (): CSSProperties => ({ ["--slideshow-transition-ms" as string]: `${fadeMs}ms` }),
    [fadeMs]
  );
  const [favBusy, setFavBusy] = useState(false);
  const [musicSrc] = useState<string | null>(() => musicTrack?.url ?? null);
  const [musicName] = useState<string | null>(() => musicTrack?.title ?? null);
  const [musicMuted, setMusicMuted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.42);
  const volumeBeforeMuteRef = useRef(0.42);
  const busyRef = useRef(false);
  const indexRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const hideChromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chromeHoverRef = useRef({ leftStrip: false, rightStrip: false, bottomStrip: false, leftRail: false, rightRail: false, bottom: false });

  const n = items.length;
  const current = n > 0 ? items[Math.min(index, n - 1)] : null;
  const previous = previousIndex != null && n > 0 ? items[Math.min(previousIndex, n - 1)] : null;
  const itemsKey = useMemo(() => items.map((i) => i.id).join("|"), [items]);
  const clearChromeHideTimer = useCallback(() => {
    if (hideChromeTimerRef.current !== null) {
      clearTimeout(hideChromeTimerRef.current);
      hideChromeTimerRef.current = null;
    }
  }, []);

  const showChrome = useCallback(() => {
    clearChromeHideTimer();
    setChromeRevealed(true);
  }, [clearChromeHideTimer]);

  const tryHideChrome = useCallback(() => {
    clearChromeHideTimer();
    hideChromeTimerRef.current = setTimeout(() => {
      const h = chromeHoverRef.current;
      if (h.leftStrip || h.rightStrip || h.bottomStrip || h.leftRail || h.rightRail || h.bottom) return;
      setChromeRevealed(false);
    }, CHROME_HIDE_DELAY_MS);
  }, [clearChromeHideTimer]);

  useEffect(() => () => clearChromeHideTimer(), [clearChromeHideTimer]);

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
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = musicMuted ? 0 : musicVolume;
  }, [musicVolume, musicMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !musicSrc) return;
    if (musicMuted) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => undefined);
  }, [musicMuted, musicSrc]);

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
      }, fadeMs);
    },
    [n, fadeMs]
  );

  const goPrev = useCallback(() => goToIndex(indexRef.current - 1), [goToIndex]);

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
    setPlaying((v) => !v);
  }, []);

  const toggleMute = useCallback(() => {
    setMusicMuted((was) => {
      if (!was) {
        volumeBeforeMuteRef.current = musicVolume > 0 ? musicVolume : 0.42;
        return true;
      }
      setMusicVolume(volumeBeforeMuteRef.current);
      return false;
    });
  }, [musicVolume]);

  useEffect(() => {
    if (!playing || n < 2) return;
    const cycleMs = effectiveDwellMs + 2 * fadeMs;
    const id = window.setInterval(() => {
      if (busyRef.current) return;
      goNext();
    }, cycleMs);
    return () => window.clearInterval(id);
  }, [playing, n, effectiveDwellMs, fadeMs, goNext]);

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
        goPrev();
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goNext, goPrev, togglePlayback]);

  useEffect(() => {
    const strip = filmstripRef.current;
    const active = strip?.querySelector(".fading-slideshow-filmstrip-item.is-active");
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [index]);

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

  const src = displayUrlFor(current);
  const previousSrc = previous ? displayUrlFor(previous) : "";
  const label = `${index + 1} / ${n}`;
  const effectiveVolume = musicMuted ? 0 : musicVolume;
  const layoutClass = `fading-slideshow-layout${chromeRevealed ? " is-chrome-revealed" : ""}`;

  const setChromeHover = (key: keyof typeof chromeHoverRef.current, value: boolean) => {
    chromeHoverRef.current[key] = value;
  };

  return (
    <div
      ref={rootRef}
      className="fading-slideshow"
      role="dialog"
      aria-modal="true"
      aria-label="Presentació de la col·lecció"
      onClick={onClose}
    >
      <div className={layoutClass} style={transitionStyle} onClick={(e) => e.stopPropagation()}>
        <div
          className="fading-slideshow-reveal-hit fading-slideshow-reveal-hit--left"
          aria-hidden
          onMouseEnter={() => {
            setChromeHover("leftStrip", true);
            showChrome();
          }}
          onMouseLeave={() => {
            setChromeHover("leftStrip", false);
            tryHideChrome();
          }}
        />
        <div
          className="fading-slideshow-reveal-hit fading-slideshow-reveal-hit--right"
          aria-hidden
          onMouseEnter={() => {
            setChromeHover("rightStrip", true);
            showChrome();
          }}
          onMouseLeave={() => {
            setChromeHover("rightStrip", false);
            tryHideChrome();
          }}
        />
        <div
          className="fading-slideshow-reveal-hit fading-slideshow-reveal-hit--bottom"
          aria-hidden
          onMouseEnter={() => {
            setChromeHover("bottomStrip", true);
            showChrome();
          }}
          onMouseLeave={() => {
            setChromeHover("bottomStrip", false);
            tryHideChrome();
          }}
        />

        <main className="fading-slideshow-stage">
          <span className="fading-slideshow-counter" aria-live="polite">
            {label}
          </span>
          <div className="fading-slideshow-img-wrap" style={transitionStyle}>
              {previous && previousSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
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
                // eslint-disable-next-line @next/next/no-img-element
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
        </main>

        <aside
          className="fading-slideshow-rail fading-slideshow-rail--left"
          aria-label="Controls de diapositives i so"
          onMouseEnter={() => {
            setChromeHover("leftRail", true);
            showChrome();
          }}
          onMouseLeave={() => {
            setChromeHover("leftRail", false);
            tryHideChrome();
          }}
          onFocusCapture={showChrome}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) tryHideChrome();
          }}
        >
          <div className="fading-slideshow-rail-group" role="toolbar" aria-label="Diapositives">
            <button
              type="button"
              className="viewer-toolbar-btn viewer-toolbar-btn--icon"
              onClick={goPrev}
              disabled={n < 2}
              aria-label="Diapositiva anterior"
              title="Anterior"
            >
              <span className="viewer-icon viewer-icon-prev" aria-hidden />
            </button>
            <button
              type="button"
              className={`viewer-toolbar-btn viewer-toolbar-btn--icon viewer-toolbar-btn--primary${playing ? "" : ""}`}
              onClick={togglePlayback}
              aria-label={playing ? "Pausar presentació" : "Reproduir presentació"}
              title={playing ? "Pausa" : "Reprodueix"}
            >
              <span className={`viewer-icon ${playing ? "viewer-icon-pause" : "viewer-icon-play"}`} aria-hidden />
            </button>
            <button
              type="button"
              className="viewer-toolbar-btn viewer-toolbar-btn--icon"
              onClick={goNext}
              disabled={n < 2}
              aria-label="Diapositiva següent"
              title="Següent"
            >
              <span className="viewer-icon viewer-icon-next" aria-hidden />
            </button>
            <button
              type="button"
              className={`viewer-toolbar-btn viewer-toolbar-btn--icon viewer-toolbar-btn--shuffle${shuffle ? " viewer-toolbar-btn--active" : ""}`}
              aria-label={shuffle ? "Desactivar ordre aleatori" : "Activar ordre aleatori"}
              title="Aleatori"
              aria-pressed={shuffle}
              onClick={() => setShuffle((v) => !v)}
            >
              <span className="viewer-icon viewer-icon-shuffle" aria-hidden />
            </button>
            <label className="fading-slideshow-speed">
              <span className="fading-slideshow-speed-label" aria-hidden>
                ×
              </span>
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value) as SlideshowSpeed)}
                aria-label="Velocitat de les transicions"
                title="Velocitat"
              >
                {SLIDESHOW_SPEEDS.map((value) => (
                  <option key={value} value={value}>
                    {value === 1 ? "1" : String(value)}×
                  </option>
                ))}
              </select>
            </label>
          </div>

          {musicSrc ? (
            <div className="fading-slideshow-rail-group fading-slideshow-rail-group--audio" aria-label="Volum">
              <label className="fading-slideshow-volume-vertical">
                <span className="sr-only">Volum</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={effectiveVolume}
                  disabled={musicMuted}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMusicVolume(v);
                    volumeBeforeMuteRef.current = v;
                    if (v > 0) setMusicMuted(false);
                  }}
                  aria-valuetext={`${Math.round(effectiveVolume * 100)}%`}
                />
              </label>
              <button
                type="button"
                className={`viewer-toolbar-btn viewer-toolbar-btn--icon${musicMuted ? " viewer-toolbar-btn--active" : ""}`}
                onClick={toggleMute}
                aria-label={musicMuted ? "Activar so" : "Silenciar música"}
                title={musicMuted ? "Activar so" : "Silenciar"}
              >
                <span className={`viewer-icon ${musicMuted ? "viewer-icon-mute" : "viewer-icon-volume"}`} aria-hidden />
              </button>
            </div>
          ) : null}
        </aside>

        <aside
          className="fading-slideshow-rail fading-slideshow-rail--right"
          aria-label="Accions"
          onMouseEnter={() => {
            setChromeHover("rightRail", true);
            showChrome();
          }}
          onMouseLeave={() => {
            setChromeHover("rightRail", false);
            tryHideChrome();
          }}
          onFocusCapture={showChrome}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) tryHideChrome();
          }}
        >
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
          <button
            type="button"
            className="viewer-toolbar-btn viewer-toolbar-btn--icon"
            aria-label="Pantalla completa"
            title="Pantalla completa"
            onClick={requestBrowserFullscreen}
          >
            <span className="viewer-icon viewer-icon-fullscreen" aria-hidden />
          </button>
          {onEditDetails ? (
            <button
              type="button"
              className="viewer-toolbar-btn viewer-toolbar-btn--icon"
              aria-label="Editar dades de la foto"
              title="Editar dades"
              onClick={() => {
                const a = current;
                onClose();
                queueMicrotask(() => onEditDetails(a));
              }}
            >
              <span className="viewer-icon viewer-icon-edit" aria-hidden />
            </button>
          ) : null}
          <button type="button" className="viewer-toolbar-btn viewer-toolbar-btn--icon" onClick={onClose} aria-label="Tancar presentació" title="Tancar">
            <span className="viewer-icon viewer-icon-close" aria-hidden />
          </button>
        </aside>

        <div
          className="fading-slideshow-bottom-dock"
          onMouseEnter={() => {
            setChromeHover("bottom", true);
            showChrome();
          }}
          onMouseLeave={() => {
            setChromeHover("bottom", false);
            tryHideChrome();
          }}
          onFocusCapture={showChrome}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) tryHideChrome();
          }}
        >
          <div ref={filmstripRef} className="fading-slideshow-filmstrip" role="tablist" aria-label="Fotos de la col·lecció">
            {items.map((item, i) => {
              const thumb = thumbUrlFor(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`${item.title}, foto ${i + 1} de ${n}`}
                  className={`fading-slideshow-filmstrip-item${i === index ? " is-active" : ""}`}
                  onClick={() => goToIndex(i)}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" referrerPolicy="no-referrer" decoding="async" />
                  ) : (
                    <span className="fading-slideshow-filmstrip-fallback" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
          {musicName ? (
            <p className="fading-slideshow-track" title={musicName}>
              ♪ {musicName}
            </p>
          ) : (
            <p className="fading-slideshow-track fading-slideshow-track--empty" aria-hidden>
              &nbsp;
            </p>
          )}
        </div>
      </div>

      {musicSrc ? <audio ref={audioRef} src={musicSrc} loop preload="auto" /> : null}
    </div>
  );
}
