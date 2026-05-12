"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GRID_DENSITY_PRESET_TILE_MIN,
  type GridDensityPreset,
  type GridDistribution,
  type GridSortOrder
} from "@/lib/grid-library";

type Props = {
  distribution: GridDistribution;
  onDistributionChange: (v: GridDistribution) => void;
  sortOrder: GridSortOrder;
  onSortOrderChange: (v: GridSortOrder) => void;
  tileMinPx: number;
  onTileMinPxChange: (px: number) => void;
  tileImageHoverPercent: number;
  onTileImageHoverPercentChange: (pct: number) => void;
};

export function GridOptionsPopover({
  distribution,
  onDistributionChange,
  sortOrder,
  onSortOrderChange,
  tileMinPx,
  onTileMinPxChange,
  tileImageHoverPercent,
  onTileImageHoverPercentChange
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  const presetActive = (p: GridDensityPreset) => tileMinPx === GRID_DENSITY_PRESET_TILE_MIN[p];

  return (
    <div className="grid-options-popover-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-sm btn-ghost grid-options-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="grid-options-panel"
        title="Opcions de graella"
        onClick={toggle}
      >
        <span className="grid-options-trigger-icon" aria-hidden>
          ⧉
        </span>
      </button>
      {open ? (
        <div id="grid-options-panel" className="grid-options-panel" role="dialog" aria-label="Opcions de graella">
          <fieldset className="grid-options-fieldset">
            <legend>Distribució</legend>
            <label className="grid-options-row">
              <input
                type="radio"
                name="grid-dist"
                checked={distribution === "uniform"}
                onChange={() => onDistributionChange("uniform")}
              />
              <span>Uniforme</span>
            </label>
            <label className="grid-options-row">
              <input
                type="radio"
                name="grid-dist"
                checked={distribution === "featured"}
                onChange={() => onDistributionChange("featured")}
              />
              <span>Preferides destacades</span>
            </label>
          </fieldset>
          <fieldset className="grid-options-fieldset">
            <legend>Mida de miniatura</legend>
            <div className="grid-options-size-row">
              <label htmlFor="grid-tile-min-px">Mín. (px)</label>
              <input
                id="grid-tile-min-px"
                type="number"
                min={80}
                max={320}
                step={1}
                value={tileMinPx}
                onChange={(e) => onTileMinPxChange(Number(e.target.value))}
              />
            </div>
            <div className="grid-options-preset-row" role="group" aria-label="Presets de densitat">
              <button
                type="button"
                className={`grid-options-preset-btn${presetActive("compact") ? " is-active" : ""}`}
                onClick={() => onTileMinPxChange(GRID_DENSITY_PRESET_TILE_MIN.compact)}
              >
                Densa
              </button>
              <button
                type="button"
                className={`grid-options-preset-btn${presetActive("balanced") ? " is-active" : ""}`}
                onClick={() => onTileMinPxChange(GRID_DENSITY_PRESET_TILE_MIN.balanced)}
              >
                Mitjana
              </button>
              <button
                type="button"
                className={`grid-options-preset-btn${presetActive("prominent") ? " is-active" : ""}`}
                onClick={() => onTileMinPxChange(GRID_DENSITY_PRESET_TILE_MIN.prominent)}
              >
                Gran
              </button>
            </div>
            <p className="grid-options-muted">El nombre de columnes s’ajusta sol segons l’ample. En «Preferides destacades», la preferida ocupa 2×2 miniatures.</p>
          </fieldset>
          <fieldset className="grid-options-fieldset">
            <legend>Passar el ratolí</legend>
            <div className="grid-options-size-row">
              <label htmlFor="grid-tile-img-hover">Zoom foto (%)</label>
              <input
                id="grid-tile-img-hover"
                type="number"
                min={100}
                max={130}
                step={1}
                value={tileImageHoverPercent}
                onChange={(e) => onTileImageHoverPercentChange(Number(e.target.value))}
              />
            </div>
            <p className="grid-options-muted">La rajola s’amplia un 15% (ombra); aquí només el zoom extra de la imatge (100% = cap).</p>
          </fieldset>
          <fieldset className="grid-options-fieldset">
            <legend>Ordre (data de captura)</legend>
            <label className="grid-options-row">
              <input type="radio" name="grid-sort" checked={sortOrder === "taken_desc"} onChange={() => onSortOrderChange("taken_desc")} />
              <span>Recents primer</span>
            </label>
            <label className="grid-options-row">
              <input type="radio" name="grid-sort" checked={sortOrder === "taken_asc"} onChange={() => onSortOrderChange("taken_asc")} />
              <span>Antigues primer</span>
            </label>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
