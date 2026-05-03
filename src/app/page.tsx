"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { assets } from "@/lib/mock-data";
import { LibraryGrid } from "@/components/library-grid";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import type { Asset } from "@/lib/types";
import { UploadDropzone } from "@/components/upload-dropzone";
import { FilterBar } from "@/components/FilterBar";
import { ViewSelector, type GalleryView } from "@/components/ViewSelector";
import { FilterProvider, useFilters } from "@/context/FilterContext";
import { ViewErrorBoundary } from "@/components/ViewErrorBoundary";
import { clearCache, getCached, setCached } from "@/lib/cache";

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

const ImageEditor = dynamic(() => import("@/components/ImageEditor").then((mod) => mod.ImageEditor), {
  loading: () => <TabLoadingHint label="editor d’imatge" />
});

function TabLoadingHint({ label }: { label: string }) {
  return (
    <p className="tab-async-loading" aria-live="polite">
      Carregant {label}…
    </p>
  );
}

type MainTab = "library" | "collections" | "memories" | "analytics";

const MAIN_TAB_LABELS: Record<MainTab, string> = {
  library: "Biblioteca",
  collections: "Col·leccions",
  memories: "Records",
  analytics: "Analítiques"
};

function HomeContent() {
  const { filters } = useFilters();
  const [view, setView] = useState<GalleryView>("masonry");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [imageEditorAsset, setImageEditorAsset] = useState<Asset | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("library");
  const [slideshowItems, setSlideshowItems] = useState<Asset[] | null>(null);
  const [library, setLibrary] = useState<Asset[]>(assets);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean | undefined>(undefined);
  const [missingEnv, setMissingEnv] = useState<string[]>([]);
  const refreshLibraryRef = useRef<() => Promise<void>>(async () => {});
  const supabaseConfiguredRef = useRef(supabaseConfigured);
  supabaseConfiguredRef.current = supabaseConfigured;

  const refreshLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    try {
      const params = new URLSearchParams();
      params.set("years", `${filters.year[0]}-${filters.year[1]}`);
      if (filters.location.length) params.set("locations", filters.location.join(","));
      if (filters.tags.length) params.set("tags", filters.tags.join(","));
      if (filters.searchQuery.trim()) params.set("q", filters.searchQuery.trim());

      const cacheKey = `assets:${params.toString()}`;
      const cached = getCached<Asset[]>(cacheKey);
      if (cached) {
        setLibrary(cached);
        return;
      }

      const response = await fetch(`/api/assets?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { assets?: Asset[]; supabaseConfigured?: boolean };
      if (body.supabaseConfigured === false) {
        return;
      }
      const next = body.assets ?? [];
      setCached(cacheKey, next, 5 * 60 * 1000);
      setLibrary(next);
    } finally {
      setLoadingLibrary(false);
    }
  }, [filters.location, filters.searchQuery, filters.tags, filters.year]);

  refreshLibraryRef.current = refreshLibrary;

  const handleLibraryUploaded = useCallback(async () => {
    clearCache();
    await refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    void fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { supabaseConfigured?: boolean; missingEnv?: string[] }) => {
        setSupabaseConfigured(!!b.supabaseConfigured);
        setMissingEnv(b.missingEnv ?? []);
      });
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const openDetailsEditorFromViewer = useCallback((asset: Asset) => {
    setSelectedId(null);
    setSlideshowItems(null);
    setSelectedAsset(asset);
  }, []);

  const openImageEditorFromViewer = useCallback((asset: Asset) => {
    setSelectedId(null);
    setSlideshowItems(null);
    setImageEditorAsset(asset);
  }, []);

  const handleMainTab = useCallback((tab: MainTab) => {
    setMainTab(tab);
  }, []);

  const onMemoryView = useCallback((assets: Asset[]) => {
    if (!assets.length) return;
    setSlideshowItems(assets);
    setSelectedId(assets[0]!.id);
  }, []);

  const onViewerClose = useCallback(() => {
    setSelectedId(null);
    setSlideshowItems(null);
  }, []);

  const onImageSaved = useCallback((updated: Asset) => {
    setLibrary((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setSelectedAsset((prev) => (prev?.id === updated.id ? updated : prev));
    clearCache();
    void refreshLibraryRef.current();
  }, []);

  const onPhotoSave = useCallback(async (updated: Asset) => {
    if (!supabaseConfiguredRef.current) {
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
  const viewerItems = useMemo(() => slideshowItems ?? viewItems, [slideshowItems, viewItems]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <nav className="tab-nav" aria-label="Secció principal">
          {(Object.keys(MAIN_TAB_LABELS) as MainTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={mainTab === tab ? "active" : ""}
              onClick={() => handleMainTab(tab)}
            >
              {MAIN_TAB_LABELS[tab]}
            </button>
          ))}
        </nav>
        {mainTab === "library" ? <ViewSelector value={view} onChange={setView} /> : null}
      </header>

      <section className="card" style={{ padding: 14 }}>
        {mainTab === "library" ? (
          <>
            <FilterBar />
            <UploadDropzone
              onUploaded={handleLibraryUploaded}
              supabaseConfigured={supabaseConfigured}
              missingEnv={missingEnv}
            />
            {loadingLibrary ? <p style={{ color: "var(--muted)" }}>Actualitzant biblioteca...</p> : null}
            <ViewErrorBoundary label="Biblioteca">
              {view === "timeline" ? (
                <TimelineView
                  items={viewItems}
                  onOpenModal={(asset) => setSelectedAsset(asset)}
                  onOpenViewer={(asset) => setSelectedId(asset.id)}
                />
              ) : null}
              {view === "masonry" ? (
                <LibraryGrid
                  items={viewItems}
                  onOpenModal={(asset) => setSelectedAsset(asset)}
                  onOpenViewer={(asset) => setSelectedId(asset.id)}
                />
              ) : null}
              {view === "map" ? (
                <MapView
                  items={viewItems}
                  onEditPhoto={(asset) => setSelectedAsset(asset)}
                  onOpenViewer={(asset) => setSelectedId(asset.id)}
                />
              ) : null}
              {view === "colors" ? (
                <ColorView
                  items={viewItems}
                  onEditPhoto={(asset) => setSelectedAsset(asset)}
                  onOpenViewer={(asset) => setSelectedId(asset.id)}
                />
              ) : null}
              {view === "slider" ? (
                <SliderView
                  items={viewItems}
                  onEditPhoto={(asset) => setSelectedAsset(asset)}
                  onOpenViewer={(asset) => setSelectedId(asset.id)}
                />
              ) : null}
            </ViewErrorBoundary>
          </>
        ) : null}
        {mainTab === "collections" ? (
          <ViewErrorBoundary label="Col·leccions">
            <Collections items={library} />
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
      </section>

      <FullscreenViewer
        items={viewerItems}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onClose={onViewerClose}
        onEditDetails={openDetailsEditorFromViewer}
        onEditImage={openImageEditorFromViewer}
      />

      {selectedAsset ? (
        <ViewErrorBoundary label="Editor de dades">
          <PhotoModal
            key={selectedAsset.id}
            asset={selectedAsset}
            onClose={() => setSelectedAsset(null)}
            onSave={onPhotoSave}
          />
        </ViewErrorBoundary>
      ) : null}

      {imageEditorAsset ? (
        <ViewErrorBoundary label="Editor d’imatge">
          <ImageEditor
            key={imageEditorAsset.id}
            asset={imageEditorAsset}
            onClose={() => setImageEditorAsset(null)}
            onDiscard={() => setImageEditorAsset(null)}
            onSaveSuccess={(updated) => {
              onImageSaved(updated);
              setImageEditorAsset(null);
            }}
          />
        </ViewErrorBoundary>
      ) : null}
    </main>
  );
}

export default function HomePage() {
  return (
    <FilterProvider>
      <HomeContent />
    </FilterProvider>
  );
}
