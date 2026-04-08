"use client";

import { useMemo, useState } from "react";
import { albums, assets } from "@/lib/mock-data";
import { filterAssets } from "@/lib/search";
import { LibraryGrid } from "@/components/library-grid";
import { TimelineView } from "@/components/timeline-view";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import { buildMemoryStories } from "@/lib/memories";

type ViewMode = "library" | "timeline" | "albums" | "favorites" | "memories";

export default function HomePage() {
  const [view, setView] = useState<ViewMode>("library");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const baseFiltered = useMemo(() => filterAssets(assets, { query }), [query]);

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
