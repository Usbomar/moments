"use client";

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";
import { useFilters } from "@/context/FilterContext";
import { ViewSelector, type GalleryView } from "@/components/ViewSelector";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

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
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const body = (await res.json()) as { user?: { email?: string } | null };
        if (!cancelled) setSessionEmail(body.user?.email?.trim() || null);
      } catch {
        if (!cancelled) setSessionEmail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSignOut = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

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
        {showLibraryViewSelector ? <ViewSelector variant="compact" value={libraryView} onChange={onLibraryViewChange} /> : null}
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
            placeholder="Cerca per títol, tags, descripció o ciutat…"
            defaultValue={filters.searchQuery}
            onChange={onSearchChange}
            autoComplete="off"
          />
        </label>
        <div className="moments-year-mini" aria-label="Filtre per anys">
          <input
            type="number"
            min={2010}
            max={filters.year[1]}
            value={filters.year[0]}
            onChange={(e) => setYear([Math.min(Number(e.target.value || 2010), filters.year[1]), filters.year[1]])}
            aria-label="Any des de"
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
            aria-label="Any fins"
          />
        </div>
      </div>
      <div className="moments-topbar-right">
        {sessionEmail ? (
          <div className="moments-user-menu">
            <span className="moments-user-email" title={sessionEmail}>
              {sessionEmail}
            </span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void onSignOut()}>
              Tancar sessió
            </button>
          </div>
        ) : null}
        {libraryUploadSlot ? <div className="moments-topbar-toolbar moments-topbar-toolbar--actions">{libraryUploadSlot}</div> : null}
        <button type="button" className="btn btn-ghost moments-settings-btn" aria-label="Configuració" title="Configuració" onClick={onAdminClick}>
          <span className="moments-settings-btn-icon" aria-hidden>
            ⚙
          </span>
        </button>
      </div>
    </header>
  );
}
