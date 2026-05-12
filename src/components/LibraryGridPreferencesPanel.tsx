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
  onTileImageHoverPercentChange
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
          La miniatura s’eleva per sobre de la graella (marc lleuger, ombra i escala ~18%). Aquí només el zoom extra de la foto dins el marc (100% = cap).
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
