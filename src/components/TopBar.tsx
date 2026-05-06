"use client";

import { useCallback, useEffect, type ReactNode, type RefObject } from "react";
import { useFilters } from "@/context/FilterContext";
import { ViewSelector, type GalleryView } from "@/components/ViewSelector";

type Props = {
  searchInputRef: RefObject<HTMLInputElement | null>;
  libraryView: GalleryView;
  onLibraryViewChange: (view: GalleryView) => void;
  showLibraryViewSelector: boolean;
  libraryUploadSlot?: ReactNode;
  onMenuClick: () => void;
  onAdminClick: () => void;
};

export function TopBar({
  searchInputRef,
  libraryView,
  onLibraryViewChange,
  showLibraryViewSelector,
  libraryUploadSlot,
  onMenuClick,
  onAdminClick
}: Props) {
  const { filters, setSearch, setYear } = useFilters();

  const onSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    [setSearch]
  );

  useEffect(() => {
    const el = searchInputRef.current;
    if (!el) return;
    el.value = filters.searchQuery;
  }, [filters.searchQuery, searchInputRef]);

  return (
    <header className="moments-topbar">
      <div className="moments-topbar-left">
        <button type="button" className="btn btn-ghost moments-menu-btn" aria-label="Obrir menú" onClick={onMenuClick}>
          ☰
        </button>
        <span className="moments-logo" aria-label="Moments">
          MOMENTS
        </span>
      </div>
      <div className="moments-topbar-center">
        <label className="moments-search-label" htmlFor="global-search">
          <span className="sr-only">Cerca</span>
          <span aria-hidden className="moments-search-icon">
            ⌕
          </span>
          <input
            ref={searchInputRef}
            id="global-search"
            type="search"
            className="moments-search-input"
            placeholder="Buscar por título, tags, descripción o ciudad…"
            defaultValue={filters.searchQuery}
            onChange={onSearchChange}
            autoComplete="off"
          />
        </label>
        <div className="moments-year-mini" aria-label="Filtro por años">
          <input
            type="number"
            min={2010}
            max={filters.year[1]}
            value={filters.year[0]}
            onChange={(e) => setYear([Math.min(Number(e.target.value || 2010), filters.year[1]), filters.year[1]])}
            aria-label="Año desde"
          />
          <span>—</span>
          <input
            type="number"
            min={filters.year[0]}
            max={new Date().getFullYear()}
            value={filters.year[1]}
            onChange={(e) =>
              setYear([filters.year[0], Math.max(filters.year[0], Number(e.target.value || new Date().getFullYear()))])
            }
            aria-label="Año hasta"
          />
        </div>
      </div>
      <div className="moments-topbar-right">
        {libraryUploadSlot || showLibraryViewSelector ? (
          <div className="moments-topbar-toolbar">
            {libraryUploadSlot}
            {showLibraryViewSelector ? <ViewSelector variant="compact" value={libraryView} onChange={onLibraryViewChange} /> : null}
          </div>
        ) : null}
        <button type="button" className="btn btn-ghost" aria-label="Administrar fotos" title="Administrar fotos" onClick={onAdminClick}>
          ⚙
        </button>
      </div>
    </header>
  );
}
