"use client";

import type { Asset } from "@/lib/types";
import {
  getAssetDate,
  indicesWithCalendarDay,
  indicesWithMonth,
  indicesWithYear
} from "@/lib/slider-temporal-nav";

export type SliderNavChipsProps = {
  asset: Asset | null;
  items: Asset[];
  subsetActive: boolean;
  onNavigateToIndices: (indices: number[]) => void;
  onClearSubset: () => void;
};

export function SliderNavChips({ asset, items, subsetActive, onNavigateToIndices, onClearSubset }: SliderNavChipsProps) {
  if (!asset) return null;

  const d = getAssetDate(asset);
  if (!d) return null;

  const dayIndices = indicesWithCalendarDay(items, d);
  const monthIndices = indicesWithMonth(items, d.getMonth());
  const yearIndices = indicesWithYear(items, d.getFullYear());

  const chips: { id: string; label: string; indices: number[] }[] = [];

  if (dayIndices.length > 1) {
    chips.push({ id: "day", label: `Dia (${dayIndices.length})`, indices: dayIndices });
  }
  if (monthIndices.length > dayIndices.length) {
    chips.push({ id: "month", label: `Mes (${monthIndices.length})`, indices: monthIndices });
  }
  if (yearIndices.length > monthIndices.length) {
    chips.push({ id: "year", label: `Any ${d.getFullYear()} (${yearIndices.length})`, indices: yearIndices });
  }

  if (!chips.length && !subsetActive) return null;

  return (
    <div className="slider-nav-chips" role="toolbar" aria-label="Filtres ràpids">
      {chips.map((chip) => (
        <button key={chip.id} type="button" className="slider-nav-chips__btn" onClick={() => onNavigateToIndices(chip.indices)}>
          {chip.label}
        </button>
      ))}
      {subsetActive ? (
        <button type="button" className="slider-nav-chips__btn slider-nav-chips__btn--clear" onClick={onClearSubset}>
          Totes les fotos
        </button>
      ) : null}
    </div>
  );
}
