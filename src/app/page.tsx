"use client";

import { useEffect, useMemo, useState } from "react";
import { albums, assets } from "@/lib/mock-data";
import { filterAssets } from "@/lib/search";
import { LibraryGrid } from "@/components/library-grid";
import { TimelineView } from "@/components/timeline-view";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import { buildMemoryStories } from "@/lib/memories";
import type { Asset } from "@/lib/types";
import { UploadDropzone } from "@/components/upload-dropzone";

type ViewMode = "library" | "timeline" | "albums" | "favorites" | "memories";

export default function HomePage() {
  const [view, setView] = useState<ViewMode>("library");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [library, setLibrary] = useState<Asset[]>(assets);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean | undefined>(undefined);

  async function refreshLibrary() {
    setLoadingLibrary(true);
    try {
      const response = await fetch("/api/assets", { cache: "no-store" });
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
      .then((b: { supabaseConfigured?: boolean }) => setSupabaseConfigured(!!b.supabaseConfigured));
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, []);

  const baseFiltered = useMemo(() => filterAssets(library, { query }), [library, query]);

  const viewItems = useMemo(() => {
    if (view === "favorites") return baseFiltered.filter((x) => x.favorite);
    return baseFiltered;
  }, [baseFiltered, view]);

  const albumGroups = useMemo(
    () =>
      albums.map((album) => ({
        album,
        items: baseFiltered.filter((asset) => asset.albumIds.includes(album.id))
      })),
    [baseFiltered]
  );
  const memoryStories = useMemo(() => buildMemoryStories(baseFiltered).slice(0, 5), [baseFiltered]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <input
          aria-label="Search photos"
          placeholder="Search by date, city or tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="controls">
          {(["library", "timeline", "albums", "favorites", "memories"] as ViewMode[]).map((mode) => (
            <button key={mode} className={view === mode ? "active" : ""} onClick={() => setView(mode)}>
              {mode}
            </button>
          ))}
        </div>
      </header>

      <section className="card" style={{ padding: 14 }}>
        {supabaseConfigured === false ? (
          <div className="config-banner" role="status">
            Estàs veient dades de mostra. Per activar pujades i emmagatzematge real, configura les variables de Supabase a{" "}
            <code>.env.local</code>.
          </div>
        ) : null}
        <UploadDropzone onUploaded={refreshLibrary} supabaseConfigured={supabaseConfigured} />
        {loadingLibrary ? <p style={{ color: "var(--muted)" }}>Actualitzant biblioteca...</p> : null}
        {view === "timeline" ? <TimelineView items={viewItems} onOpen={(asset) => setSelectedId(asset.id)} /> : null}
        {view === "library" || view === "favorites" ? (
          <LibraryGrid items={viewItems} onOpen={(asset) => setSelectedId(asset.id)} />
        ) : null}
        {view === "albums"
          ? albumGroups.map(({ album, items }) => (
              <section key={album.id} style={{ marginBottom: 20 }}>
                <h3>{album.name}</h3>
                <LibraryGrid items={items} onOpen={(asset) => setSelectedId(asset.id)} />
              </section>
            ))
          : null}
        {view === "memories" ? (
          <div>
            <h3>Story Mode (Phase 2-ready)</h3>
            <p style={{ color: "var(--muted)" }}>
              Auto-generated stories will use event windows, music and transitions from the background pipeline.
            </p>
            <div className="controls" style={{ marginBottom: 12 }}>
              {memoryStories.map((story) => (
                <button key={story.id}>{story.title}</button>
              ))}
            </div>
            <LibraryGrid items={viewItems.slice(0, 12)} onOpen={(asset) => setSelectedId(asset.id)} />
          </div>
        ) : null}
      </section>

      <FullscreenViewer items={viewItems} selectedId={selectedId} onSelect={setSelectedId} onClose={() => setSelectedId(null)} />
    </main>
  );
}
