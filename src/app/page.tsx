"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LibraryGrid } from "@/components/library-grid";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import { FadingSlideshow } from "@/components/FadingSlideshow";
import type { MainNavTab } from "@/components/LeftNav";
import type { Asset } from "@/lib/types";
import { UploadDropzone } from "@/components/upload-dropzone";
import { type GalleryView } from "@/components/ViewSelector";
import { FilterProvider, useFilters } from "@/context/FilterContext";
import { ViewErrorBoundary } from "@/components/ViewErrorBoundary";
import { clearCache } from "@/lib/cache";
import type { EditOperation, ExportOptions } from "@/lib/image-edit-ops";
import { MainLayout } from "@/layouts/MainLayout";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { loadCollections } from "@/lib/collections-storage";
import type { AppCollection } from "@/lib/collections";
import { AdminAssetManager } from "@/components/AdminAssetManager";
import { GridOptionsPopover } from "@/components/GridOptionsPopover";
import {
  clampTileMinPx,
  GRID_DENSITY_PRESET_TILE_MIN,
  normalizeFeaturedTileSize,
  normalizeTileImageHoverPercent,
  sortAssetsForGrid,
  type GridDistribution,
  type GridSortOrder
} from "@/lib/grid-library";

const MapView = dynamic(() => import("@/views/MapView").then((mod) => mod.MapView), {
  ssr: false,
  loading: () => <TabLoadingHint label="mapa" />
});

const ColorView = dynamic(() => import("@/views/ColorView").then((mod) => mod.ColorView), {
  loading: () => <TabLoadingHint label="vista per colors" />
});

const SliderView = dynamic(() => import("@/views/SliderView").then((mod) => mod.SliderView), {
  loading: () => <TabLoadingHint label="presentació" />
});

const Collections = dynamic(() => import("@/components/Collections").then((mod) => mod.Collections), {
  loading: () => <TabLoadingHint label="col·leccions" />
});
const CollectionMosaicView = dynamic(() => import("@/components/CollectionMosaicView").then((mod) => mod.CollectionMosaicView), {
  loading: () => <TabLoadingHint label="col·leccions" />
});

const Memories = dynamic(() => import("@/components/Memories").then((mod) => mod.Memories), {
  loading: () => <TabLoadingHint label="records" />
});

const Analytics = dynamic(() => import("@/components/Analytics").then((mod) => mod.Analytics), {
  loading: () => <TabLoadingHint label="analítiques" />
});

const TimelineView = dynamic(() => import("@/components/timeline-view").then((mod) => mod.TimelineView), {
  loading: () => <TabLoadingHint label="cronologia" />
});

const PhotoModal = dynamic(() => import("@/components/PhotoModal").then((mod) => mod.PhotoModal), {
  loading: () => <TabLoadingHint label="editor de foto" />
});

const ImageEditorV2 = dynamic(() => import("@/components/ImageEditor/ImageEditorV2").then((mod) => mod.ImageEditorV2), {
  loading: () => <TabLoadingHint label="editor d’imatge" />
});

function TabLoadingHint({ label }: { label: string }) {
  return (
    <p className="tab-async-loading" aria-live="polite">
      Carregant {label}…
    </p>
  );
}

const GRID_DIST_STORAGE = "moments-grid-distribution";
const GRID_SORT_STORAGE = "moments-grid-sort";
const GRID_TILE_MIN_STORAGE = "moments-grid-tile-min-px";
const GRID_TILE_IMG_HOVER_STORAGE = "moments-grid-tile-img-hover-pct";
/** Llegit només per migració si falta `moments-grid-tile-min-px`. */
const GRID_FEATURED_TILE_STORAGE = "moments-grid-featured-tile-size";

function HomeContent() {
  const COLLECTIONS_MIGRATED_KEY = "moments_collections_migrated_to_server_v1";
  const { filters } = useFilters();
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<GalleryView>("masonry");
  const [gridDistribution, setGridDistribution] = useState<GridDistribution>("uniform");
  const [tileMinPx, setTileMinPx] = useState(() => GRID_DENSITY_PRESET_TILE_MIN.balanced);
  const [tileImageHoverPercent, setTileImageHoverPercent] = useState(100);
  const [gridSortOrder, setGridSortOrder] = useState<GridSortOrder>("taken_desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [imageEditorAsset, setImageEditorAsset] = useState<Asset | null>(null);
  const [mainTab, setMainTab] = useState<MainNavTab>("library");
  const [slideshowItems, setSlideshowItems] = useState<Asset[] | null>(null);
  /** Ordre de navegació del visor ple pantalla quan s’obre des d’una vista (graella, mosaic, mapa, etc.). */
  const [viewerQueue, setViewerQueue] = useState<Asset[] | null>(null);
  const [collectionSlideshow, setCollectionSlideshow] = useState<Asset[] | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [photoModalFront, setPhotoModalFront] = useState(false);
  const [adminCollections, setAdminCollections] = useState<AppCollection[]>([]);
  const [library, setLibrary] = useState<Asset[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingMoreLibrary, setLoadingMoreLibrary] = useState(false);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [libraryLoadError, setLibraryLoadError] = useState<string | null>(null);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean | undefined>(undefined);
  const [authConfigured, setAuthConfigured] = useState<boolean | undefined>(undefined);
  const [missingEnv, setMissingEnv] = useState<string[]>([]);
  const [authMissingEnv, setAuthMissingEnv] = useState<string[]>([]);
  const refreshLibraryRef = useRef<() => Promise<void>>(async () => {});
  const supabaseConfiguredRef = useRef(supabaseConfigured);
  supabaseConfiguredRef.current = supabaseConfigured;

  const buildAssetsParams = useCallback(
    (offset: number, limit: number) => {
      const params = new URLSearchParams();
      params.set("years", `${filters.year[0]}-${filters.year[1]}`);
      if (filters.location.length) params.set("locations", filters.location.join(","));
      if (filters.tags.length) params.set("tags", filters.tags.join(","));
      if (filters.searchQuery.trim()) params.set("q", filters.searchQuery.trim());
      params.set("offset", String(offset));
      params.set("limit", String(limit));
      return params;
    },
    [filters.location, filters.searchQuery, filters.tags, filters.year]
  );

  const refreshLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    setLibraryLoadError(null);
    setLibraryHasMore(false);
    try {
      const params = buildAssetsParams(0, 200);
      const response = await fetch(`/api/assets?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as {
        assets?: Asset[];
        supabaseConfigured?: boolean;
        error?: string;
        paging?: { hasMore?: boolean };
      };

      if (!response.ok) {
        setLibrary([]);
        if (response.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
          return;
        }
        const errMsg = typeof body.error === "string" ? body.error : `Error ${response.status} en carregar la biblioteca`;
        setLibraryLoadError(errMsg);
        return;
      }

      if (body.supabaseConfigured === false) {
        setLibrary([]);
        return;
      }

      setLibrary(body.assets ?? []);
      setLibraryHasMore(!!body.paging?.hasMore);
    } finally {
      setLoadingLibrary(false);
    }
  }, [buildAssetsParams]);

  const loadMoreLibrary = useCallback(async () => {
    if (loadingMoreLibrary || loadingLibrary || !libraryHasMore) return;
    setLoadingMoreLibrary(true);
    try {
      const params = buildAssetsParams(library.length, 200);
      const response = await fetch(`/api/assets?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as {
        assets?: Asset[];
        error?: string;
        paging?: { hasMore?: boolean };
      };
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
          return;
        }
        setLibraryLoadError(body.error ?? "Error carregant més fotos.");
        return;
      }

      const chunk = body.assets ?? [];
      setLibrary((prev) => {
        const known = new Set(prev.map((x) => x.id));
        const merged = [...prev];
        for (const item of chunk) {
          if (!known.has(item.id)) merged.push(item);
        }
        return merged;
      });
      setLibraryHasMore(!!body.paging?.hasMore);
    } finally {
      setLoadingMoreLibrary(false);
    }
  }, [buildAssetsParams, library.length, libraryHasMore, loadingLibrary, loadingMoreLibrary]);

  refreshLibraryRef.current = refreshLibrary;

  const handleLibraryUploaded = useCallback(async () => {
    clearCache();
    await refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    void fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (b: {
          supabaseConfigured?: boolean;
          authConfigured?: boolean;
          missingEnv?: string[];
          authMissingEnv?: string[];
        }) => {
          setSupabaseConfigured(!!b.supabaseConfigured);
          setAuthConfigured(!!b.authConfigured);
          setMissingEnv(b.missingEnv ?? []);
          setAuthMissingEnv(b.authMissingEnv ?? []);
        }
      );
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    try {
      const d = window.localStorage.getItem(GRID_DIST_STORAGE) as GridDistribution | null;
      const s = window.localStorage.getItem(GRID_SORT_STORAGE) as GridSortOrder | null;
      const pxRaw = window.localStorage.getItem(GRID_TILE_MIN_STORAGE);
      const imgRaw = window.localStorage.getItem(GRID_TILE_IMG_HOVER_STORAGE);
      if (d === "uniform" || d === "featured") setGridDistribution(d);
      if (s === "taken_desc" || s === "taken_asc") setGridSortOrder(s);
      if (pxRaw != null && pxRaw.trim() !== "") {
        const n = Number.parseInt(pxRaw, 10);
        if (Number.isFinite(n)) setTileMinPx(clampTileMinPx(n));
      } else {
        const fts = window.localStorage.getItem(GRID_FEATURED_TILE_STORAGE);
        const preset = normalizeFeaturedTileSize(fts);
        setTileMinPx(GRID_DENSITY_PRESET_TILE_MIN[preset]);
      }
      if (imgRaw != null && imgRaw.trim() !== "") {
        setTileImageHoverPercent(normalizeTileImageHoverPercent(imgRaw));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(GRID_DIST_STORAGE, gridDistribution);
      window.localStorage.setItem(GRID_SORT_STORAGE, gridSortOrder);
      window.localStorage.setItem(GRID_TILE_MIN_STORAGE, String(tileMinPx));
      window.localStorage.setItem(GRID_TILE_IMG_HOVER_STORAGE, String(tileImageHoverPercent));
    } catch {
      /* ignore */
    }
  }, [gridDistribution, gridSortOrder, tileMinPx, tileImageHoverPercent]);

  useEffect(() => {
    if (supabaseConfigured !== true) return;
    if (typeof window === "undefined") return;
    const alreadyMigrated = window.localStorage.getItem(COLLECTIONS_MIGRATED_KEY);
    if (alreadyMigrated === "1") return;
    const legacy = loadCollections();
    if (!legacy.length) {
      window.localStorage.setItem(COLLECTIONS_MIGRATED_KEY, "1");
      return;
    }

    void (async () => {
      try {
        const response = await fetch("/api/collections/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collections: legacy })
        });
        if (response.ok) {
          window.localStorage.setItem(COLLECTIONS_MIGRATED_KEY, "1");
        }
      } catch {
        /* reintentarà al pròxim carregat */
      }
    })();
  }, [supabaseConfigured]);

  const onMemoryView = useCallback((memAssets: Asset[]) => {
    if (!memAssets.length) return;
    setViewerQueue(null);
    setSlideshowItems(memAssets);
    setSelectedId(memAssets[0]!.id);
  }, []);

  const onCollectionSlideshow = useCallback((assets: Asset[]) => {
    if (!assets.length) return;
    setSelectedId(null);
    setSlideshowItems(null);
    setCollectionSlideshow(assets);
  }, []);

  const openViewer = useCallback((asset: Asset, contextItems: Asset[]) => {
    setCollectionSlideshow(null);
    setSelectedAsset(null);
    setImageEditorAsset(null);
    setSlideshowItems(null);
    setViewerQueue(contextItems.length ? contextItems : null);
    setSelectedId(asset.id);
  }, []);

  const openDetailsFromViewer = useCallback((asset: Asset) => {
    setSelectedId(null);
    setSlideshowItems(null);
    setCollectionSlideshow(null);
    setSelectedAsset(asset);
  }, []);

  const openImageEditorFromViewer = useCallback((asset: Asset) => {
    setSelectedId(null);
    setSlideshowItems(null);
    setCollectionSlideshow(null);
    setImageEditorAsset(asset);
  }, []);

  const openDetailsFromCollectionSlideshow = useCallback((asset: Asset) => {
    setCollectionSlideshow(null);
    setSelectedId(null);
    setSlideshowItems(null);
    setSelectedAsset(asset);
  }, []);

  const onViewerClose = useCallback(() => {
    setSelectedId(null);
    setSlideshowItems(null);
  }, []);

  const modalOpen = !!(selectedAsset || imageEditorAsset || selectedId || (collectionSlideshow?.length ?? 0) > 0);

  const onModalEscape = useCallback(() => {
    if (imageEditorAsset) return;
    if (selectedAsset) {
      setSelectedAsset(null);
      return;
    }
    if (collectionSlideshow?.length) {
      setCollectionSlideshow(null);
      return;
    }
    if (selectedId) {
      onViewerClose();
    }
  }, [imageEditorAsset, selectedAsset, selectedId, collectionSlideshow, onViewerClose]);

  useKeyboardShortcuts({
    searchInputRef: searchRef,
    isModalOpen: modalOpen,
    onModalEscape
  });

  const onImageSaved = useCallback((updated: Asset) => {
    setLibrary((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setSelectedAsset((prev) => (prev?.id === updated.id ? updated : prev));
    clearCache();
    void refreshLibraryRef.current();
  }, []);

  const refreshAdminCollections = useCallback(async () => {
    const res = await fetch("/api/collections", { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { collections?: AppCollection[] };
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
      return;
    }
    if (res.ok) setAdminCollections(body.collections ?? []);
  }, []);

  useEffect(() => {
    if (mainTab !== "library") return;
    if (view !== "collections") return;
    void refreshAdminCollections();
  }, [mainTab, refreshAdminCollections, view]);

  const saveImageEdits = useCallback(
    async (operations: EditOperation[], exportOpts: ExportOptions) => {
      const id = imageEditorAsset?.id;
      if (!id) {
        throw new Error("Sense asset per desar.");
      }
      const res = await fetch(`/api/assets/${id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations, export: exportOpts })
      });
      const body = (await res.json()) as { asset?: Asset; error?: string };
      if (!res.ok || !body.asset) {
        throw new Error(body.error ?? "Error en desar");
      }
      onImageSaved(body.asset);
      setImageEditorAsset(null);
    },
    [imageEditorAsset, onImageSaved]
  );

  const onPhotoSave = useCallback(async (updated: Asset) => {
    // Fallback local només quan sabem segur que Supabase NO està configurat.
    // Si l'estat encara és "undefined" (càrrega inicial), intentem persistir al servidor.
    if (supabaseConfiguredRef.current === false) {
      setLibrary((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      return;
    }
    const response = await fetch(`/api/assets/${updated.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: updated.title,
        description: updated.description ?? null,
        tags: updated.tags,
        taken_at: updated.takenAt,
        favorite: updated.favorite,
        hidden_from_guests: updated.hiddenFromGuests === true,
        color_hue: updated.colorHue ?? null,
        location: updated.location ?? null
      })
    });
    const payload = (await response.json()) as { asset?: Asset; error?: string };
    if (!response.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.error("PATCH asset failed:", payload.error ?? response.statusText);
      }
      return;
    }
    if (payload.asset) {
      setLibrary((prev) => prev.map((a) => (a.id === payload.asset!.id ? payload.asset! : a)));
    }
    clearCache();
    await refreshLibraryRef.current();
  }, []);

  const viewItems = useMemo(() => library, [library]);
  const gridCatalogItems = useMemo(() => sortAssetsForGrid(library, gridSortOrder), [library, gridSortOrder]);
  const viewerItems = useMemo(() => slideshowItems ?? viewerQueue ?? viewItems, [slideshowItems, viewerQueue, viewItems]);

  const libraryTagSuggestions = useMemo(() => {
    const s = new Set<string>();
    for (const a of library) {
      for (const t of a.tags ?? []) {
        const n = String(t).trim().toLowerCase();
        if (n) s.add(n);
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b, "ca"));
  }, [library]);

  return (
    <>
      <MainLayout
        activeNav={mainTab}
        onNavChange={setMainTab}
        libraryView={view}
        onLibraryViewChange={setView}
        searchInputRef={searchRef}
        onAdminClick={() => {
          setAdminOpen(true);
          void refreshAdminCollections();
        }}
        libraryUploadSlot={
          mainTab === "library" ? (
            <UploadDropzone
              onUploaded={handleLibraryUploaded}
              supabaseConfigured={supabaseConfigured}
              missingEnv={missingEnv}
            />
          ) : undefined
        }
        libraryGridOptionsSlot={
          mainTab === "library" && view === "masonry" ? (
            <GridOptionsPopover
              distribution={gridDistribution}
              onDistributionChange={setGridDistribution}
              sortOrder={gridSortOrder}
              onSortOrderChange={setGridSortOrder}
              tileMinPx={tileMinPx}
              onTileMinPxChange={(v) => setTileMinPx(clampTileMinPx(v))}
              tileImageHoverPercent={tileImageHoverPercent}
              onTileImageHoverPercentChange={(v) => setTileImageHoverPercent(normalizeTileImageHoverPercent(v))}
            />
          ) : undefined
        }
      >
        <div className="moments-card-inner">
          {mainTab === "library" ? (
            <>
              {loadingLibrary ? <p style={{ color: "var(--text-secondary)", marginTop: 12 }}>Actualitzant biblioteca…</p> : null}
              {libraryLoadError ? (
                <p className="modal-error" style={{ marginTop: 12 }} role="alert">
                  {libraryLoadError}
                  {" "}
                  <span className="modal-muted">
                    Sovint passa si falta una migració SQL (p. ex. columna <code>color_hue</code>) o credencials incorrectes.
                  </span>
                </p>
              ) : null}
              {supabaseConfigured === true && authConfigured === false ? (
                <div className="config-banner config-banner-auth" role="status">
                  Falta configurar l’autenticació: afegeix <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> al <code>.env.local</code>
                  {authMissingEnv.length ? ` (${authMissingEnv.join(", ")})` : ""}.
                </div>
              ) : null}
              {!loadingLibrary && library.length === 0 && supabaseConfigured === true && !libraryLoadError ? (
                <p className="modal-muted" style={{ marginTop: 12 }}>
                  No hi ha fotos que coincideixin amb els filtres (o la biblioteca és buida). Prova d’eixamplar l’interval d’anys o
                  neteja filtres.
                </p>
              ) : null}
              <ViewErrorBoundary label="Biblioteca">
                <div style={{ marginTop: 16 }}>
                  {view === "timeline" ? (
                    <TimelineView
                      items={viewItems}
                      distribution={gridDistribution}
                      tileMinPx={tileMinPx}
                      imageHoverPercent={tileImageHoverPercent}
                      onOpenModal={(asset) => setSelectedAsset(asset)}
                      onOpenViewer={openViewer}
                    />
                  ) : null}
                  {view === "masonry" ? (
                    <LibraryGrid
                      items={gridCatalogItems}
                      distribution={gridDistribution}
                      tileMinPx={tileMinPx}
                      imageHoverPercent={tileImageHoverPercent}
                      onOpenModal={(asset) => setSelectedAsset(asset)}
                      onOpenViewer={openViewer}
                    />
                  ) : null}
                  {view === "colors" ? (
                    <ColorView
                      items={viewItems}
                      distribution={gridDistribution}
                      tileMinPx={tileMinPx}
                      imageHoverPercent={tileImageHoverPercent}
                      onEditPhoto={(asset) => setSelectedAsset(asset)}
                      onOpenViewer={openViewer}
                    />
                  ) : null}
                  {view === "collections" ? (
                    <CollectionMosaicView
                      items={viewItems}
                      collections={adminCollections}
                      maxOpen={5}
                      onOpenModal={(asset) => setSelectedAsset(asset)}
                      onOpenViewer={openViewer}
                    />
                  ) : null}
                  {view === "slider" ? (
                    <SliderView
                      items={viewItems}
                      onEditPhoto={(asset) => setSelectedAsset(asset)}
                      onOpenViewer={openViewer}
                    />
                  ) : null}
                </div>
              </ViewErrorBoundary>
              {libraryHasMore ? (
                <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={loadingMoreLibrary}
                    onClick={() => void loadMoreLibrary()}
                  >
                    {loadingMoreLibrary ? "Carregant més..." : "Carregar més fotos"}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
          {mainTab === "collections" ? (
            <ViewErrorBoundary label="Col·leccions">
              <Collections items={library} onPlaySlideshow={onCollectionSlideshow} />
            </ViewErrorBoundary>
          ) : null}
          {mainTab === "map" ? (
            <ViewErrorBoundary label="Mapa">
              <MapView
                items={library}
                distribution={gridDistribution}
                tileMinPx={tileMinPx}
                imageHoverPercent={tileImageHoverPercent}
                onEditPhoto={(asset) => setSelectedAsset(asset)}
                onOpenViewer={openViewer}
              />
            </ViewErrorBoundary>
          ) : null}
          {mainTab === "memories" ? (
            <ViewErrorBoundary label="Records">
              <Memories items={library} onView={onMemoryView} />
            </ViewErrorBoundary>
          ) : null}
          {mainTab === "analytics" ? (
            <ViewErrorBoundary label="Analítiques">
              <Analytics items={library} />
            </ViewErrorBoundary>
          ) : null}
        </div>
      </MainLayout>

      <FullscreenViewer
        items={viewerItems}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onClose={onViewerClose}
        onEditDetails={openDetailsFromViewer}
        onEditImage={openImageEditorFromViewer}
      />

      {collectionSlideshow?.length ? (
        <ViewErrorBoundary label="Presentació col·lecció">
          <FadingSlideshow
            items={collectionSlideshow}
            onClose={() => setCollectionSlideshow(null)}
            onEditDetails={openDetailsFromCollectionSlideshow}
          />
        </ViewErrorBoundary>
      ) : null}

      {selectedAsset ? (
        <ViewErrorBoundary label="Editor de dades">
          <PhotoModal
            key={selectedAsset.id}
            asset={selectedAsset}
            libraryTagSuggestions={libraryTagSuggestions}
            front={photoModalFront}
            onClose={() => {
              setSelectedAsset(null);
              setPhotoModalFront(false);
            }}
            onSave={onPhotoSave}
          />
        </ViewErrorBoundary>
      ) : null}

      {imageEditorAsset ? (
        <ViewErrorBoundary label="Editor d’imatge">
          <ImageEditorV2
            key={imageEditorAsset.id}
            asset={imageEditorAsset}
            onDiscard={() => setImageEditorAsset(null)}
            onSave={saveImageEdits}
          />
        </ViewErrorBoundary>
      ) : null}

      <AdminAssetManager
        open={adminOpen}
        assets={viewItems}
        collections={adminCollections}
        onClose={() => setAdminOpen(false)}
        onEdit={(asset) => {
          setPhotoModalFront(true);
          setSelectedAsset(asset);
        }}
        onEditImage={(asset) => {
          setImageEditorAsset(asset);
        }}
        onQuickUpdate={async (asset, patch) => {
          const merged: Asset = {
            ...asset,
            ...patch,
            location: patch.location === undefined ? undefined : patch.location
          };
          setLibrary((prev) => prev.map((a) => (a.id === asset.id ? merged : a)));
          await onPhotoSave(merged);
        }}
        onDelete={async (asset) => {
          const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
          if (!res.ok) return;
          setLibrary((prev) => prev.filter((x) => x.id !== asset.id));
          if (selectedAsset?.id === asset.id) setSelectedAsset(null);
          if (selectedId === asset.id) setSelectedId(null);
          clearCache();
          await refreshLibraryRef.current();
          await refreshAdminCollections();
        }}
        onRefreshCollections={refreshAdminCollections}
        libraryGridPrefs={{
          distribution: gridDistribution,
          onDistributionChange: setGridDistribution,
          sortOrder: gridSortOrder,
          onSortOrderChange: setGridSortOrder,
          tileMinPx,
          onTileMinPxChange: (v) => setTileMinPx(clampTileMinPx(v)),
          tileImageHoverPercent,
          onTileImageHoverPercentChange: (v) => setTileImageHoverPercent(normalizeTileImageHoverPercent(v))
        }}
      />
    </>
  );
}

export default function HomePage() {
  return (
    <FilterProvider>
      <HomeContent />
    </FilterProvider>
  );
}
