"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LibraryGrid } from "@/components/library-grid";
import { FullscreenViewer } from "@/components/fullscreen-viewer";
import type { Asset } from "@/lib/types";

export default function GuestCollectionPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";

  const [displayName, setDisplayName] = useState("Moments");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadChunk = useCallback(
    async (offset: number, append: boolean) => {
      const res = await fetch(`/api/guest/${encodeURIComponent(slug)}/assets?offset=${offset}&limit=200`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as {
        assets?: Asset[];
        paging?: { hasMore?: boolean };
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Error carregant les fotos.");
      }
      const chunk = body.assets ?? [];
      setAssets((prev) => (append ? [...prev, ...chunk.filter((c) => !prev.some((p) => p.id === c.id))] : chunk));
      setHasMore(!!body.paging?.hasMore);
    },
    [slug]
  );

  useEffect(() => {
    if (!slug) return;
    void (async () => {
      setLoading(true);
      setError(null);
      setAssets([]);
      try {
        const metaRes = await fetch(`/api/guest/${encodeURIComponent(slug)}`, { cache: "no-store" });
        if (!metaRes.ok) {
          setError("Aquest enllaç no està disponible o l’accés convidat està desactivat.");
          setLoading(false);
          return;
        }
        const meta = (await metaRes.json()) as { displayName?: string };
        setDisplayName(meta.displayName?.trim() || "Moments");
        await loadChunk(0, false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de connexió.");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, loadChunk]);

  const openViewer = useCallback((asset: Asset) => {
    setSelectedId(asset.id);
  }, []);

  const viewerItems = useMemo(() => assets, [assets]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await loadChunk(assets.length, true);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }, [assets.length, hasMore, loadChunk, loadingMore]);

  return (
    <>
      <div className="guest-public-page guest-public-page--wide">
        <header className="guest-public-header">
          <div>
            <h1 className="guest-public-title">{displayName}</h1>
            <p className="modal-muted guest-public-lead">Vista només lectura · Moments</p>
          </div>
          <nav className="guest-public-nav">
            <Link href="/guest">Altres col·leccions</Link>
            <Link href="/login">Iniciar sessió</Link>
          </nav>
        </header>

        {loading ? <p className="modal-muted">Carregant…</p> : null}
        {error ? (
          <p className="modal-error" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error ? (
          <>
            {assets.length === 0 ? (
              <p className="modal-muted">No hi ha fotos visibles per a convidats.</p>
            ) : (
              <div className="guest-public-grid-wrap">
                <LibraryGrid items={assets} onOpenViewer={openViewer} />
              </div>
            )}
            {hasMore ? (
              <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
                <button type="button" className="btn btn-sm" disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? "Carregant…" : "Carregar més fotos"}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <FullscreenViewer items={viewerItems} selectedId={selectedId} onSelect={setSelectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
