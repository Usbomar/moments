"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Asset } from "@/lib/types";
import type { SliderTransition } from "@/lib/grid-library";
import { SliderFilmstrip } from "@/components/SliderFilmstrip";
import { SliderKeyboardHelp } from "@/components/SliderKeyboardHelp";
import { SliderMetadataStrip } from "@/components/SliderMetadataStrip";
import { SliderMiniMap } from "@/components/SliderMiniMap";
import { SliderNavChips } from "@/components/SliderNavChips";
import { SliderTimeline } from "@/components/SliderTimeline";
import { ViewerFavoriteButton } from "@/components/ViewerFavoriteButton";
import { resolveAssetColorHex } from "@/lib/color-utils";
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
  /** Superposició fosca a pantalla completa (modal). Per defecte incrustat dins la biblioteca. */
  const [overlayMode, setOverlayMode] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [subsetIndices, setSubsetIndices] = useState<number[] | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => new Set());
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const itemsKeyRef = useRef<string>("");
  const busyRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  /** Sense animació d'entrada crossfade/zoom al primer fotograma (evita parpelleig). */
  const skipEnterTransitionRef = useRef(true);

  const itemsKey = useMemo(() => items.map((item) => item.id).join("|"), [items]);

  const current = useMemo(() => items[index] ?? null, [items, index]);
  const previous = previousIndex != null ? items[previousIndex] ?? null : null;

  const navigableIndices = useMemo(
    () => (subsetIndices?.length ? subsetIndices : items.map((_, i) => i)),
    [items, subsetIndices]
  );

  const positionLabel = useMemo(() => {
    const pos = navigableIndices.indexOf(index);
    const n = navigableIndices.length;
    if (pos < 0 || n < 1) return "";
    return `${pos + 1} / ${n}`;
  }, [index, navigableIndices]);

  const accentColor = useMemo(() => (current ? resolveAssetColorHex(current) : null), [current]);

  /** Parallax (doble capa) només en superposició fosca — evita parpelleigs a la vista incrustada. */
  const useKenBurnsParallax = useMemo(() => {
    if (!overlayMode || !current) return false;
    if (!current.width || !current.height) return true;
    const ratio = current.height / current.width;
    return ratio > 0.45 && ratio < 2.2;
  }, [current, overlayMode]);

  useEffect(() => {
    const prevKey = itemsKeyRef.current;
    if (prevKey === itemsKey) return;
    const isInitialBind = prevKey === "" && itemsKey !== "";
    itemsKeyRef.current = itemsKey;
    if (isInitialBind) return;
    queueMicrotask(() => {
      skipEnterTransitionRef.current = true;
      setPreviousIndex(null);
      busyRef.current = false;
      setSubsetIndices(null);
      setDismissedSuggestions(new Set());
      setIndex(0);
    });
  }, [itemsKey, items.length]);

  const goToIndex = useCallback(
    (nextRaw: number) => {
      if (busyRef.current || items.length < 1) return;
      const next = ((nextRaw % items.length) + items.length) % items.length;
      if (next === index) return;
      skipEnterTransitionRef.current = false;
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

  useEffect(() => {
    if (!playing || !items.length) return;
    const timer = window.setInterval(() => {
      goNext();
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [playing, speedMs, items.length, goNext]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((prev) => !prev);
      } else if (event.key === "ArrowRight") {
        goNext();
      } else if (event.key === "ArrowLeft") {
        goPrev();
      } else if (event.key === "Escape") {
        if (keyboardHelpOpen) {
          setKeyboardHelpOpen(false);
        } else if (overlayMode) {
          setOverlayMode(false);
        }
      } else if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        event.preventDefault();
        setKeyboardHelpOpen((v) => !v);
      } else if (event.key === "Home") {
        event.preventDefault();
        if (navigableIndices.length) goToIndex(navigableIndices[0]!);
      } else if (event.key === "End") {
        event.preventDefault();
        if (navigableIndices.length) goToIndex(navigableIndices[navigableIndices.length - 1]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, goToIndex, keyboardHelpOpen, navigableIndices, overlayMode]);

  const toggleBrowserFullscreen = useCallback(() => {
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

  const btnClass = "viewer-toolbar-btn";
  const toolbarClass = overlayMode
    ? "viewer-toolbar slider-view-toolbar"
    : "viewer-toolbar slider-view-toolbar slider-view-toolbar--embedded";
  const currentSrc = (current.files.mediumUrl || current.files.previewUrl || current.files.originalUrl).trim();
  const previousSrc = previous ? (previous.files.mediumUrl || previous.files.previewUrl || previous.files.originalUrl).trim() : "";

  const subsetActive = subsetIndices != null && subsetIndices.length > 0;
  const mediaBoxClass = [
    "slider-view-media-box",
    `slider-view-media-box--transition-${transition}`,
    overlayMode ? "slider-view-media-box--ken-burns" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const kenBurnsClass = ["slider-ken-burns", useKenBurnsParallax ? "slider-ken-burns--parallax" : ""].filter(Boolean).join(" ");
  const currentTransitionClass = skipEnterTransitionRef.current ? "" : `slider-view-media--current-${transition}`;

  return (
    <section
      ref={sectionRef}
      className={overlayMode ? "viewer slider-view--overlay" : "slider-view-embedded view-panel"}
      onClick={overlayMode ? () => setOverlayMode(false) : undefined}
    >
      <div
        className={`slider-view-stack${overlayMode ? " viewer-inner slider-view-stack--immersive" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {overlayMode ? (
          <>
            <div className="slider-fullscreen-hover-zone slider-fullscreen-hover-zone--top" aria-hidden />
            <div className="slider-fullscreen-hover-zone slider-fullscreen-hover-zone--bottom" aria-hidden />
          </>
        ) : null}
        <div className={mediaBoxClass}>
          <div
            key={`accent-${current.id}`}
            className={`slider-color-bar${accentColor ? "" : " slider-color-bar--empty"}`}
            style={{ "--slider-accent-color": accentColor ?? "transparent" } as CSSProperties}
            aria-hidden
          />
          <SliderMiniMap items={items} highlightIndices={navigableIndices} currentIndex={index} />
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
          <div key={`kenburns-${current.id}`} className={kenBurnsClass}>
            {useKenBurnsParallax && currentSrc ? (
              <div
                className="slider-ken-burns__bg"
                style={{ backgroundImage: `url("${currentSrc}")` }}
                aria-hidden
              />
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element -- URL signades / emmagatzematge */}
            <img
              className={[
                "viewer-media slider-view-media slider-view-media--current slider-ken-burns__fg",
                currentTransitionClass
              ]
                .filter(Boolean)
                .join(" ")}
              src={currentSrc}
              alt={current.title}
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="async"
              fetchPriority="high"
              onClick={() => onEditPhoto(current)}
            />
          </div>
          <SliderMetadataStrip asset={current} />
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
        <div className="slider-view-controls">
          <SliderNavChips
            asset={current}
            items={items}
            subsetActive={subsetActive}
            onNavigateToIndices={applySubset}
            onClearSubset={clearSubset}
            positionLabel={positionLabel}
          />
          <div className="slider-view-controls__end">
            <SliderKeyboardHelp open={keyboardHelpOpen} onToggle={() => setKeyboardHelpOpen((v) => !v)} />
          </div>
        </div>
        <SliderTimeline
          items={items}
          orderedIndices={navigableIndices}
          currentIndex={index}
          onJumpToIndex={goToIndex}
        />
        <SliderFilmstrip items={items} orderedIndices={navigableIndices} currentIndex={index} onJumpToIndex={goToIndex} />
        <div
          className={`slider-view-toolbar-slot${overlayMode ? " slider-fullscreen-toolbar-hide" : ""} ${toolbarClass}`}
          role="toolbar"
          aria-label="Controls del slider"
        >
          <button type="button" className={btnClass} onClick={goPrev}>
            Anterior
          </button>
          <button type="button" className={btnClass} onClick={() => setPlaying((prev) => !prev)}>
            {playing ? "Pausa" : "Reprodueix"}
          </button>
          <button
            type="button"
            className={`${btnClass} viewer-toolbar-btn--icon viewer-toolbar-btn--shuffle${shuffle ? " viewer-toolbar-btn--active" : ""}`}
            aria-label={shuffle ? "Desactivar ordre aleatori" : "Activar ordre aleatori"}
            title={shuffle ? "Aleatori activat" : "Aleatori"}
            aria-pressed={shuffle}
            onClick={() => setShuffle((value) => !value)}
          >
            <span className="viewer-icon viewer-icon-shuffle" aria-hidden />
          </button>
          <button
            type="button"
            className={`${btnClass} viewer-toolbar-btn--icon`}
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
          <label className="slider-view-speed slider-view-speed--fs">
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
