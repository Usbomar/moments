"use client";

import { useId } from "react";
import {
  GRID_DENSITY_PRESET_TILE_MIN,
  type GridDensityPreset,
  type LibraryGridPreferencesBinder
} from "@/lib/grid-library";

export type LibraryGridPrefsPanelVariant = "popover" | "settings";

type Props = LibraryGridPreferencesBinder & {
  variant: LibraryGridPrefsPanelVariant;
};

export function LibraryGridPreferencesPanel({
  variant,
  distribution,
  onDistributionChange,
  sortOrder,
  onSortOrderChange,
  tileMinPx,
  onTileMinPxChange,
  tileImageHoverPercent,
  onTileImageHoverPercentChange,
  tileHoverFrameScalePercent,
  onTileHoverFrameScalePercentChange,
  tileHoverLiftPx,
  onTileHoverLiftPxChange,
  tileHoverShadowPct,
  onTileHoverShadowPctChange
}: Props) {
  const rid = useId();
  const distName = `${rid}-dist`;
  const sortName = `${rid}-sort`;
  const presetActive = (p: GridDensityPreset) => tileMinPx === GRID_DENSITY_PRESET_TILE_MIN[p];

  const rootClass = variant === "settings" ? "library-grid-prefs library-grid-prefs--settings" : "library-grid-prefs";

  return (
    <div className={rootClass}>
      <fieldset className="grid-options-fieldset">
        <legend>Distribució</legend>
        <label className="grid-options-row">
          <input type="radio" name={distName} checked={distribution === "uniform"} onChange={() => onDistributionChange("uniform")} />
          <span>Uniforme</span>
        </label>
        <label className="grid-options-row">
          <input type="radio" name={distName} checked={distribution === "featured"} onChange={() => onDistributionChange("featured")} />
          <span>Preferides destacades</span>
        </label>
      </fieldset>
      <fieldset className="grid-options-fieldset">
        <legend>Mida de miniatura</legend>
        <div className="grid-options-size-row">
          <label htmlFor={`${rid}-tile-px`}>Mín. (px)</label>
          <input
            id={`${rid}-tile-px`}
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
          <label htmlFor={`${rid}-frame-scale`}>Escala del marc (%)</label>
          <input
            id={`${rid}-frame-scale`}
            type="number"
            min={108}
            max={130}
            step={1}
            value={tileHoverFrameScalePercent}
            onChange={(e) => onTileHoverFrameScalePercentChange(Number(e.target.value))}
          />
        </div>
        <div className="grid-options-size-row">
          <label htmlFor={`${rid}-lift`}>Elevació (px)</label>
          <input
            id={`${rid}-lift`}
            type="number"
            min={0}
            max={14}
            step={1}
            value={tileHoverLiftPx}
            onChange={(e) => onTileHoverLiftPxChange(Number(e.target.value))}
          />
        </div>
        <div className="grid-options-size-row">
          <label htmlFor={`${rid}-shadow`}>Ombra (%)</label>
          <input
            id={`${rid}-shadow`}
            type="number"
            min={40}
            max={160}
            step={1}
            value={tileHoverShadowPct}
            onChange={(e) => onTileHoverShadowPctChange(Number(e.target.value))}
          />
        </div>
        <div className="grid-options-size-row">
          <label htmlFor={`${rid}-img-hover`}>Zoom foto (%)</label>
          <input
            id={`${rid}-img-hover`}
            type="number"
            min={100}
            max={130}
            step={1}
            value={tileImageHoverPercent}
            onChange={(e) => onTileImageHoverPercentChange(Number(e.target.value))}
          />
        </div>
        <p className="grid-options-muted">
          «Escala del marc» (108–130 %): quant creix el recuadre respecte al repòs (118 % = valor per defecte). «Elevació» (0–14 px) i «Ombra»
          (40–160 %, 100 = referència) afinen el moviment i la profunditat. «Zoom foto» només la imatge dins el marc (100 % = cap).
        </p>
      </fieldset>
      <fieldset className="grid-options-fieldset">
        <legend>Ordre (data de captura)</legend>
        <label className="grid-options-row">
          <input type="radio" name={sortName} checked={sortOrder === "taken_desc"} onChange={() => onSortOrderChange("taken_desc")} />
          <span>Recents primer</span>
        </label>
        <label className="grid-options-row">
          <input type="radio" name={sortName} checked={sortOrder === "taken_asc"} onChange={() => onSortOrderChange("taken_asc")} />
          <span>Antigues primer</span>
        </label>
      </fieldset>
      {variant === "popover" ? (
        <p className="grid-options-muted" style={{ marginTop: 10 }}>
          També pots editar-ho tot a <strong>Configuració</strong> → pestanya <strong>Graella</strong>.
        </p>
      ) : null}
    </div>
  );
}
