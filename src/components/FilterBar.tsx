"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Range } from "react-range";
import { useFilters } from "@/context/FilterContext";

const MIN_YEAR = 2010;
const MAX_YEAR = new Date().getFullYear();

interface LocationOption {
  city: string;
  country: string;
  label: string;
}

export function FilterBar() {
  const { filters, setYear, addLocation, removeLocation, addTag, removeTag, clearFilters } = useFilters();
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    void fetch("/api/locations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((body: { locations?: LocationOption[] }) => setLocations(body.locations ?? []))
      .catch(() => setLocations([]));
  }, []);

  const yearValues = useMemo<[number, number]>(() => filters.year, [filters.year]);

  const onTagSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!tagInput.trim()) return;
      addTag(tagInput);
      setTagInput("");
    },
    [addTag, tagInput]
  );

  return (
    <section className="filter-bar-pro" aria-label="Filtres de biblioteca">
      <div className="controls filter-bar-row" style={{ alignItems: "center" }}>
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

        <select
          aria-label="Location filter"
          value={selectedLocation}
          onChange={(e) => {
            const value = e.target.value;
            setSelectedLocation(value);
            if (value) addLocation(value);
          }}
        >
          <option value="">Afegir lloc...</option>
          {locations.map((loc) => (
            <option key={loc.label} value={loc.label}>
              {loc.label}
            </option>
          ))}
        </select>

        <form onSubmit={onTagSubmit} style={{ display: "flex", gap: 8 }}>
          <input placeholder="Afegir tag…" value={tagInput} onChange={(e) => setTagInput(e.target.value)} aria-label="Nou tag" />
          <button type="submit" className="btn btn-sm">
            Afegir
          </button>
        </form>

        <button type="button" className="btn btn-sm" onClick={clearFilters}>
          Netejar filtres
        </button>
      </div>

      {filters.location.length ? (
        <div className="controls" style={{ marginTop: 8 }}>
          {filters.location.map((loc) => (
            <button key={loc} type="button" onClick={() => removeLocation(loc)}>
              {loc} ×
            </button>
          ))}
        </div>
      ) : null}

      {filters.tags.length ? (
        <div className="controls" style={{ marginTop: 8 }}>
          {filters.tags.map((tag) => (
            <button key={tag} type="button" onClick={() => removeTag(tag)}>
              #{tag} ×
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
