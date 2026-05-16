"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import type { SliderTransition } from "@/lib/grid-library";
import { BreadcrumbTemporal } from "@/components/BreadcrumbTemporal";
import { ViewerFavoriteButton } from "@/components/ViewerFavoriteButton";
import {
  getAssetDate,
  getConsecutiveNearbyRun,
  getConsecutiveSameDayRun,
  indicesWithCalendarDay,
  SMART_DAY_MIN_PHOTOS,
  SMART_LOCATION_MIN_PHOTOS,
  SMART_LOCATION_RADIUS_KM
} from "@/lib/slider-temporal-nav";

const SLIDER_TRANSITION_MS = 450;
const SMART_SUGGESTION_DISMISS_MS = 3000;

type SmartSuggestion =
  | { id: string; kind: "day"; count: number; indices: number[] }
  | { id: string; kind: "location"; count: number; indices: number[]; placeLabel: string };

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
  const [subsetIndices, setSubsetIndices] = useState<number[] | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => new Set());
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
      setSubsetIndices(null);
      setDismissedSuggestions(new Set());
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

  const applySubset = useCallback(
    (indices: number[]) => {
      if (!indices.length) return;
      setSubsetIndices(indices);
      goToIndex(indices[0]!);
    },
    [goToIndex]
  );

  const clearSubset = useCallback(() => {
    setSubsetIndices(null);
  }, []);

  const advanceInSubset = useCallback(
    (delta: number) => {
      if (!subsetIndices?.length) return false;
      const pos = subsetIndices.indexOf(index);
      const base = pos >= 0 ? pos : 0;
      const nextPos = (base + delta + subsetIndices.length) % subsetIndices.length;
      goToIndex(subsetIndices[nextPos]!);
      return true;
    },
    [goToIndex, index, subsetIndices]
  );

  const goNext = useCallback(() => {
    if (advanceInSubset(1)) return;
    if (!shuffle || items.length < 3) {
      goToIndex(index + 1);
      return;
    }
    let next = index;
    while (next === index) {
      next = Math.floor(Math.random() * items.length);
    }
    goToIndex(next);
  }, [advanceInSubset, goToIndex, index, items.length, shuffle]);

  const goPrev = useCallback(() => {
    if (advanceInSubset(-1)) return;
    goToIndex(index - 1);
  }, [advanceInSubset, goToIndex, index]);

  const smartSuggestion = useMemo((): SmartSuggestion | null => {
    if (!items.length) return null;

    const dayRun = getConsecutiveSameDayRun(items, index);
    if (dayRun.length >= SMART_DAY_MIN_PHOTOS) {
      return { id: `day-${dayRun[0]}-${dayRun[dayRun.length - 1]}`, kind: "day", count: dayRun.length, indices: dayRun };
    }

    const locRun = getConsecutiveNearbyRun(items, index, SMART_LOCATION_RADIUS_KM);
    if (locRun.length >= SMART_LOCATION_MIN_PHOTOS) {
      const city = items[index]?.location?.city?.trim();
      const placeLabel = city || "aquesta zona";
      return {
        id: `loc-${locRun[0]}-${locRun[locRun.length - 1]}`,
        kind: "location",
        count: locRun.length,
        indices: locRun,
        placeLabel
      };
    }

    return null;
  }, [index, items]);

  const visibleSuggestion = smartSuggestion && !dismissedSuggestions.has(smartSuggestion.id) ? smartSuggestion : null;

  useEffect(() => {
    if (!visibleSuggestion) return;
    const timer = window.setTimeout(() => {
      setDismissedSuggestions((prev) => {
        const next = new Set(prev);
        next.add(visibleSuggestion.id);
        return next;
      });
    }, SMART_SUGGESTION_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [visibleSuggestion]);

  useEffect(() => {
    if (!subsetIndices?.length) return;
    if (!subsetIndices.includes(index)) {
      setSubsetIndices(null);
    }
  }, [index, subsetIndices]);

  const dismissSuggestion = useCallback((id: string) => {
    setDismissedSuggestions((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const acceptSuggestion = useCallback(
    (suggestion: SmartSuggestion) => {
      dismissSuggestion(suggestion.id);
      if (suggestion.kind === "day") {
        const d = getAssetDate(items[index]!);
        if (d) {
          applySubset(indicesWithCalendarDay(items, d));
          return;
        }
      }
      applySubset(suggestion.indices);
    },
    [applySubset, dismissSuggestion, index, items]
  );

  const handleBreadcrumbJump = useCallback(
    (targetIndex: number) => {
      clearSubset();
      goToIndex(targetIndex);
    },
    [clearSubset, goToIndex]
  );

  const handleBreadcrumbSubset = useCallback(
    (indices: number[]) => {
      applySubset(indices);
    },
    [applySubset]
  );

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

  const subsetActive = subsetIndices != null && subsetIndices.length > 0;

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
          <BreadcrumbTemporal
            asset={current}
            items={items}
            currentIndex={index}
            onJumpToIndex={handleBreadcrumbJump}
            onNavigateToIndices={handleBreadcrumbSubset}
          />
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
          {visibleSuggestion ? (
            <div className="slider-smart-nav" role="status" aria-live="polite">
              <button
                type="button"
                className="slider-smart-nav__btn"
                onClick={() => acceptSuggestion(visibleSuggestion)}
              >
                {visibleSuggestion.kind === "day" ? (
                  <>
                    Vull veure totes les fotos d&apos;aquest dia? ({visibleSuggestion.count} fotos)
                  </>
                ) : (
                  <>
                    Viatge detectat a {visibleSuggestion.placeLabel}? ({visibleSuggestion.count} fotos)
                  </>
                )}
              </button>
              <button
                type="button"
                className="slider-smart-nav__dismiss"
                aria-label="Ignorar suggeriment"
                onClick={() => dismissSuggestion(visibleSuggestion.id)}
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
        {subsetActive ? (
          <p className="slider-view-subset-hint">
            Navegant una subsecció ({subsetIndices!.length} fotos).{" "}
            <button type="button" className="slider-view-subset-hint__clear" onClick={clearSubset}>
              Mostrar tota la biblioteca
            </button>
          </p>
        ) : null}
        <div className={toolbarClass} role="toolbar" aria-label="Controls del slider">
          <button type="button" className={btnClass} onClick={goPrev}>
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
