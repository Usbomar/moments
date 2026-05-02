"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export interface GlobalFilters {
  year: [number, number];
  location: string[];
  tags: string[];
  searchQuery: string;
}

interface FilterContextValue {
  filters: GlobalFilters;
  setYear: (range: [number, number]) => void;
  addLocation: (location: string) => void;
  removeLocation: (location: string) => void;
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  setSearch: (query: string) => void;
  clearFilters: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_FILTERS: GlobalFilters = {
  year: [2010, CURRENT_YEAR],
  location: [],
  tags: [],
  searchQuery: ""
};

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(DEFAULT_FILTERS);

  const setYear = useCallback((range: [number, number]) => {
    setFilters((prev) => ({ ...prev, year: range }));
  }, []);

  const addLocation = useCallback((location: string) => {
    const normalized = location.trim();
    if (!normalized) return;
    setFilters((prev) => {
      if (prev.location.includes(normalized)) return prev;
      return { ...prev, location: [...prev.location, normalized] };
    });
  }, []);

  const removeLocation = useCallback((location: string) => {
    setFilters((prev) => ({ ...prev, location: prev.location.filter((item) => item !== location) }));
  }, []);

  const addTag = useCallback((tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) return;
    setFilters((prev) => {
      if (prev.tags.includes(normalized)) return prev;
      return { ...prev, tags: [...prev.tags, normalized] };
    });
  }, []);

  const removeTag = useCallback((tag: string) => {
    setFilters((prev) => ({ ...prev, tags: prev.tags.filter((item) => item !== tag) }));
  }, []);

  const setSearch = useCallback((query: string) => {
    setFilters((prev) => ({ ...prev, searchQuery: query }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const value = useMemo<FilterContextValue>(
    () => ({
      filters,
      setYear,
      addLocation,
      removeLocation,
      addTag,
      removeTag,
      setSearch,
      clearFilters
    }),
    [filters, setYear, addLocation, removeLocation, addTag, removeTag, setSearch, clearFilters]
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error("useFilters must be used inside FilterProvider");
  }
  return ctx;
}
