"use client";

import { useMemo } from "react";
import { Range } from "react-range";
import { useFilters } from "@/context/FilterContext";

const MIN_YEAR = 2010;
const MAX_YEAR = new Date().getFullYear();

export function FilterBar() {
  const { filters, setYear, clearFilters } = useFilters();

  const yearValues = useMemo<[number, number]>(() => filters.year, [filters.year]);

  return (
    <section className="filter-bar-pro" aria-label="Filtres de biblioteca">
      <div className="controls filter-bar-row" style={{ alignItems: "center", justifyContent: "flex-end" }}>
        <label style={{ minWidth: 220 }}>
          <small style={{ display: "block", color: "var(--muted)", marginBottom: 6 }}>
            Any: {yearValues[0]} - {yearValues[1]}
          </small>
          <Range
            min={MIN_YEAR}
            max={MAX_YEAR}
            step={1}
            values={yearValues}
            onChange={(values) => setYear([values[0], values[1]])}
            renderTrack={({ props, children }) => (
              <div {...props} style={{ ...props.style, height: 6, width: "100%", background: "#dfe4ea", borderRadius: 999 }}>
                {children}
              </div>
            )}
            renderThumb={({ props }) => (
              <div
                {...props}
                key={props.key}
                style={{ ...props.style, height: 16, width: 16, borderRadius: 999, backgroundColor: "#2f6fed", boxShadow: "0 1px 6px rgba(0,0,0,.2)" }}
              />
            )}
          />
        </label>

        <button type="button" className="btn btn-sm" onClick={clearFilters}>
          Netejar filtres
        </button>
      </div>
    </section>
  );
}
