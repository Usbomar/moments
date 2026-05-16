"use client";

import { useMemo } from "react";
import type { Asset } from "@/lib/types";
import {
  formatMonthLabelCa,
  getAssetDate,
  indicesWithCalendarDay,
  indicesWithMonth,
  indicesWithYear
} from "@/lib/slider-temporal-nav";

export type BreadcrumbTemporalProps = {
  asset: Asset | null;
  items: Asset[];
  /** Índex actual dins de `items` (per «Foto X/Y»). */
  currentIndex: number;
  onJumpToIndex: (index: number) => void;
  /** Salta a una subsecció (p. ex. totes les fotos d’un mes o d’un dia). */
  onNavigateToIndices?: (indices: number[]) => void;
};

type Segment =
  | { kind: "year"; label: string; action: () => void }
  | { kind: "month"; label: string; action: () => void }
  | { kind: "day"; label: string; action: () => void }
  | { kind: "photo"; label: string };

function SegmentButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`breadcrumb-temporal__segment breadcrumb-temporal__segment--btn ${className ?? ""}`.trim()} onClick={onClick}>
      {label}
    </button>
  );
}

export function BreadcrumbTemporal({ asset, items, currentIndex, onJumpToIndex, onNavigateToIndices }: BreadcrumbTemporalProps) {
  const segments = useMemo((): Segment[] | null => {
    if (!asset || !items.length) return null;
    const date = getAssetDate(asset);
    if (!date) return null;

    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    const yearIndices = indicesWithYear(items, year);
    const monthIndices = indicesWithMonth(items, month);
    const dayIndices = indicesWithCalendarDay(items, date);

    const posInDay = Math.max(0, dayIndices.indexOf(currentIndex)) + 1;
    const totalDay = dayIndices.length || 1;

    const goSubset = (indices: number[]) => {
      if (!indices.length) return;
      if (onNavigateToIndices) onNavigateToIndices(indices);
      else onJumpToIndex(indices[0]!);
    };

    return [
      {
        kind: "year",
        label: String(year),
        action: () => {
          if (yearIndices.length) onJumpToIndex(yearIndices[0]!);
        }
      },
      {
        kind: "month",
        label: formatMonthLabelCa(date),
        action: () => goSubset(monthIndices)
      },
      {
        kind: "day",
        label: String(day),
        action: () => goSubset(dayIndices)
      },
      {
        kind: "photo",
        label: `Foto ${posInDay}/${totalDay}`
      }
    ];
  }, [asset, items, currentIndex, onJumpToIndex, onNavigateToIndices]);

  if (!segments?.length) return null;

  return (
    <nav className="breadcrumb-temporal" aria-label="Ubicació temporal de la foto">
      <ol className="breadcrumb-temporal__list">
        {segments.map((seg, i) => (
          <li key={`${seg.kind}-${seg.label}`} className={`breadcrumb-temporal__item breadcrumb-temporal__item--${seg.kind}`}>
            {i > 0 ? (
              <span className="breadcrumb-temporal__sep" aria-hidden>
                →
              </span>
            ) : null}
            {seg.kind === "photo" ? (
              <span className={`breadcrumb-temporal__segment breadcrumb-temporal__segment--photo breadcrumb-temporal__segment--${seg.kind}`}>{seg.label}</span>
            ) : (
              <SegmentButton
                label={seg.label}
                onClick={seg.action}
                className={`breadcrumb-temporal__segment--${seg.kind}`}
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
