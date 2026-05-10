"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GridDistribution, GridSortOrder } from "@/lib/grid-library";

type Props = {
  distribution: GridDistribution;
  onDistributionChange: (v: GridDistribution) => void;
  sortOrder: GridSortOrder;
  onSortOrderChange: (v: GridSortOrder) => void;
};

export function GridOptionsPopover({ distribution, onDistributionChange, sortOrder, onSortOrderChange }: Props) {
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
