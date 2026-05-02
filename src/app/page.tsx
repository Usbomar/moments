"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { assets } from "@/lib/mock-data";
import { LibraryGrid } from "@/components/library-grid";
import { TimelineView } from "@/components/timeline-view";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import type { Asset } from "@/lib/types";
import { UploadDropzone } from "@/components/upload-dropzone";
import { FilterBar } from "@/components/FilterBar";
import { ViewSelector, type GalleryView } from "@/components/ViewSelector";
import { FilterProvider, useFilters } from "@/context/FilterContext";
import { ColorView } from "@/views/ColorView";
import { SliderView } from "@/views/SliderView";

const MapView = dynamic(() => import("@/views/MapView").then((mod) => mod.MapView), { ssr: false });

function HomeContent() {
  const { filters } = useFilters();
  const [view, setView] = useState<GalleryView>("masonry");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [library, setLibrary] = useState<Asset[]>(assets);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean | undefined>(undefined);
  const [missingEnv, setMissingEnv] = useState<string[]>([]);

  async function refreshLibrary() {
    setLoadingLibrary(true);
    try {
      const params = new URLSearchParams();
      params.set("years", `${filters.year[0]}-${filters.year[1]}`);
      if (filters.location.length) params.set("locations", filters.location.join(","));
      if (filters.tags.length) params.set("tags", filters.tags.join(","));
      if (filters.searchQuery.trim()) params.set("q", filters.searchQuery.trim());

      const response = await fetch(`/api/assets?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { assets?: Asset[]; supabaseConfigured?: boolean };
      if (body.supabaseConfigured === false) {
        return;
      }
      setLibrary(body.assets ?? []);
    } finally {
      setLoadingLibrary(false);
    }
  }

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
  }, [filters.year, filters.location, filters.tags, filters.searchQuery]);

  const viewItems = useMemo(() => library, [library]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <ViewSelector value={view} onChange={setView} />
      </header>

      <section className="card" style={{ padding: 14 }}>
        <FilterBar />
        <UploadDropzone onUploaded={refreshLibrary} supabaseConfigured={supabaseConfigured} missingEnv={missingEnv} />
        {loadingLibrary ? <p style={{ color: "var(--muted)" }}>Actualitzant biblioteca...</p> : null}
        {view === "timeline" ? <TimelineView items={viewItems} onOpen={(asset) => setSelectedId(asset.id)} /> : null}
        {view === "masonry" ? (
          <LibraryGrid items={viewItems} onOpen={(asset) => setSelectedId(asset.id)} />
        ) : null}
        {view === "map" ? <MapView items={viewItems} onOpen={(asset) => setSelectedId(asset.id)} /> : null}
        {view === "colors" ? <ColorView items={viewItems} onOpen={(asset) => setSelectedId(asset.id)} /> : null}
        {view === "slider" ? <SliderView items={viewItems} /> : null}
      </section>

      {view !== "slider" ? (
        <FullscreenViewer items={viewItems} selectedId={selectedId} onSelect={setSelectedId} onClose={() => setSelectedId(null)} />
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
