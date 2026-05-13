"use client";

import { useId } from "react";
import {
  GRID_DENSITY_PRESET_TILE_MIN,
  GRID_TILE_MIN_PX_ABS_MAX,
  GRID_TILE_MIN_PX_ABS_MIN,
  type GridDensityPreset,
  type LibraryGridPreferencesBinder,
  type SliderTransition
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
  onTileHoverShadowPctChange,
  sliderTransition,
  onSliderTransitionChange
}: Props) {
  const rid = useId();
  const presetActive = (p: GridDensityPreset) => tileMinPx === GRID_DENSITY_PRESET_TILE_MIN[p];

  const rootClass = variant === "settings" ? "library-grid-prefs library-grid-prefs--settings" : "library-grid-prefs";
  const sliderTransitionOptions: Array<{ id: SliderTransition; label: string; hint: string; iconClass: string }> = [
    { id: "crossfade", label: "Fusió", hint: "Fotos superposades", iconClass: "grid-options-icon-transition-crossfade" },
    { id: "fade", label: "Fos", hint: "Entrada suau", iconClass: "grid-options-icon-transition-fade" },
    { id: "slide", label: "Lliscament", hint: "Moviment lateral", iconClass: "grid-options-icon-transition-slide" },
    { id: "zoom", label: "Zoom", hint: "Aproximació lleu", iconClass: "grid-options-icon-transition-zoom" },
    { id: "wipe", label: "Cortina", hint: "Revelat net", iconClass: "grid-options-icon-transition-wipe" }
  ];

  return (
    <div className={rootClass}>
      {variant === "settings" ? (
        <div className="grid-options-hero">
          <span className="grid-options-hero-icon grid-options-icon-grid" aria-hidden />
          <div>
            <strong>Graella de fotos</strong>
            <span>Control ràpid de densitat, ordre i moviment. Es desa automàticament al navegador.</span>
          </div>
        </div>
      ) : null}

      <fieldset className="grid-options-fieldset">
        <legend>
          <span className="grid-options-section-icon grid-options-icon-layout" aria-hidden />
          Distribució
        </legend>
        <div className="grid-options-choice-grid grid-options-choice-grid--two" role="group" aria-label="Distribució de la graella">
          <button
            type="button"
            className={`grid-options-choice-card${distribution === "uniform" ? " is-active" : ""}`}
            aria-pressed={distribution === "uniform"}
            onClick={() => onDistributionChange("uniform")}
          >
            <span className="grid-options-choice-icon grid-options-icon-uniform" aria-hidden />
            <span>
              <strong>Uniforme</strong>
              <small>Totes iguals</small>
            </span>
          </button>
          <button
            type="button"
            className={`grid-options-choice-card${distribution === "featured" ? " is-active" : ""}`}
            aria-pressed={distribution === "featured"}
            onClick={() => onDistributionChange("featured")}
          >
            <span className="grid-options-choice-icon grid-options-icon-featured" aria-hidden />
            <span>
              <strong>Destacades</strong>
              <small>Preferides grans</small>
            </span>
          </button>
        </div>
      </fieldset>

      <fieldset className="grid-options-fieldset">
        <legend>
          <span className="grid-options-section-icon grid-options-icon-density" aria-hidden />
          Densitat
        </legend>
        <div className="grid-options-preset-row" role="group" aria-label="Presets de densitat">
          <button
            type="button"
            className={`grid-options-preset-btn${presetActive("compact") ? " is-active" : ""}`}
            onClick={() => onTileMinPxChange(GRID_DENSITY_PRESET_TILE_MIN.compact)}
          >
            <span className="grid-options-density-mark grid-options-density-mark--compact" aria-hidden />
            <span>Densa</span>
          </button>
          <button
            type="button"
            className={`grid-options-preset-btn${presetActive("balanced") ? " is-active" : ""}`}
            onClick={() => onTileMinPxChange(GRID_DENSITY_PRESET_TILE_MIN.balanced)}
          >
            <span className="grid-options-density-mark grid-options-density-mark--balanced" aria-hidden />
            <span>Mitjana</span>
          </button>
          <button
            type="button"
            className={`grid-options-preset-btn${presetActive("prominent") ? " is-active" : ""}`}
            onClick={() => onTileMinPxChange(GRID_DENSITY_PRESET_TILE_MIN.prominent)}
          >
            <span className="grid-options-density-mark grid-options-density-mark--prominent" aria-hidden />
            <span>Gran</span>
          </button>
        </div>
        <label className="grid-options-control" htmlFor={`${rid}-tile-px`}>
          <span>
            <strong>Mida mínima</strong>
            <small>Columnes automàtiques</small>
          </span>
          <span className="grid-options-control-inputs">
            <input
              id={`${rid}-tile-px`}
              type="range"
              min={GRID_TILE_MIN_PX_ABS_MIN}
              max={GRID_TILE_MIN_PX_ABS_MAX}
              step={1}
              value={tileMinPx}
              onChange={(e) => onTileMinPxChange(Number(e.target.value))}
            />
            <input
              aria-label="Mida mínima en píxels"
              type="number"
              min={GRID_TILE_MIN_PX_ABS_MIN}
              max={GRID_TILE_MIN_PX_ABS_MAX}
              step={1}
              value={tileMinPx}
              onChange={(e) => onTileMinPxChange(Number(e.target.value))}
            />
          </span>
        </label>
      </fieldset>

      <fieldset className="grid-options-fieldset">
        <legend>
          <span className="grid-options-section-icon grid-options-icon-hover" aria-hidden />
          Moviment
        </legend>
        <div className="grid-options-control-stack">
          <label className="grid-options-control" htmlFor={`${rid}-frame-scale`}>
            <span>
              <strong>Marc</strong>
              <small>Creixement</small>
            </span>
            <span className="grid-options-control-inputs">
              <input
                id={`${rid}-frame-scale`}
                type="range"
                min={108}
                max={130}
                step={1}
                value={tileHoverFrameScalePercent}
                onChange={(e) => onTileHoverFrameScalePercentChange(Number(e.target.value))}
              />
              <input
                aria-label="Escala del marc en percentatge"
                type="number"
                min={108}
                max={130}
                step={1}
                value={tileHoverFrameScalePercent}
                onChange={(e) => onTileHoverFrameScalePercentChange(Number(e.target.value))}
              />
            </span>
          </label>
          <label className="grid-options-control" htmlFor={`${rid}-lift`}>
            <span>
              <strong>Elevació</strong>
              <small>Píxels</small>
            </span>
            <span className="grid-options-control-inputs">
              <input
                id={`${rid}-lift`}
                type="range"
                min={0}
                max={14}
                step={1}
                value={tileHoverLiftPx}
                onChange={(e) => onTileHoverLiftPxChange(Number(e.target.value))}
              />
              <input
                aria-label="Elevació en píxels"
                type="number"
                min={0}
                max={14}
                step={1}
                value={tileHoverLiftPx}
                onChange={(e) => onTileHoverLiftPxChange(Number(e.target.value))}
              />
            </span>
          </label>
          <label className="grid-options-control" htmlFor={`${rid}-shadow`}>
            <span>
              <strong>Ombra</strong>
              <small>Profunditat</small>
            </span>
            <span className="grid-options-control-inputs">
              <input
                id={`${rid}-shadow`}
                type="range"
                min={40}
                max={160}
                step={1}
                value={tileHoverShadowPct}
                onChange={(e) => onTileHoverShadowPctChange(Number(e.target.value))}
              />
              <input
                aria-label="Intensitat de l'ombra en percentatge"
                type="number"
                min={40}
                max={160}
                step={1}
                value={tileHoverShadowPct}
                onChange={(e) => onTileHoverShadowPctChange(Number(e.target.value))}
              />
            </span>
          </label>
          <label className="grid-options-control" htmlFor={`${rid}-img-hover`}>
            <span>
              <strong>Zoom foto</strong>
              <small>Imatge interna</small>
            </span>
            <span className="grid-options-control-inputs">
              <input
                id={`${rid}-img-hover`}
                type="range"
                min={100}
                max={130}
                step={1}
                value={tileImageHoverPercent}
                onChange={(e) => onTileImageHoverPercentChange(Number(e.target.value))}
              />
              <input
                aria-label="Zoom de la foto en percentatge"
                type="number"
                min={100}
                max={130}
                step={1}
                value={tileImageHoverPercent}
                onChange={(e) => onTileImageHoverPercentChange(Number(e.target.value))}
              />
            </span>
          </label>
        </div>
      </fieldset>

      {variant === "settings" ? (
        <fieldset className="grid-options-fieldset">
          <legend>
            <span className="grid-options-section-icon grid-options-icon-transition" aria-hidden />
            Transició sliders
          </legend>
          <div className="grid-options-choice-grid grid-options-choice-grid--transitions" role="group" aria-label="Efecte de transició entre fotos dels sliders">
            {sliderTransitionOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`grid-options-choice-card grid-options-choice-card--compact${sliderTransition === option.id ? " is-active" : ""}`}
                aria-pressed={sliderTransition === option.id}
                onClick={() => onSliderTransitionChange(option.id)}
              >
                <span className={`grid-options-choice-icon ${option.iconClass}`} aria-hidden />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="grid-options-fieldset">
        <legend>
          <span className="grid-options-section-icon grid-options-icon-sort" aria-hidden />
          Ordre
        </legend>
        <div className="grid-options-choice-grid grid-options-choice-grid--two" role="group" aria-label="Ordre per data de captura">
          <button
            type="button"
            className={`grid-options-choice-card${sortOrder === "taken_desc" ? " is-active" : ""}`}
            aria-pressed={sortOrder === "taken_desc"}
            onClick={() => onSortOrderChange("taken_desc")}
          >
            <span className="grid-options-choice-icon grid-options-icon-newest" aria-hidden />
            <span>
              <strong>Recents</strong>
              <small>Primer</small>
            </span>
          </button>
          <button
            type="button"
            className={`grid-options-choice-card${sortOrder === "taken_asc" ? " is-active" : ""}`}
            aria-pressed={sortOrder === "taken_asc"}
            onClick={() => onSortOrderChange("taken_asc")}
          >
            <span className="grid-options-choice-icon grid-options-icon-oldest" aria-hidden />
            <span>
              <strong>Antigues</strong>
              <small>Primer</small>
            </span>
          </button>
        </div>
      </fieldset>
      {variant === "popover" ? (
        <p className="grid-options-muted">
          També pots editar-ho tot a <strong>Configuració</strong> → pestanya <strong>Graella</strong>.
        </p>
      ) : null}
    </div>
  );
}
