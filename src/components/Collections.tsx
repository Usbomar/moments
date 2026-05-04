"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import type { Asset } from "@/lib/types";
import { loadCollections, saveCollections, type StoredCollection } from "@/lib/collections-storage";
import { LazyImage } from "@/components/LazyImage";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c-${Date.now()}`;
}

interface Props {
  items: Asset[];
  /** Obre el visor a pantalla completa només amb els assets d’aquesta col·lecció */
  onPlaySlideshow?: (assets: Asset[]) => void;
}

export function Collections({ items, onPlaySlideshow }: Props) {
  const [collections, setCollections] = useState<StoredCollection[]>(() => loadCollections());
  const [nameInput, setNameInput] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const onChange = () => setCollections(loadCollections());
    window.addEventListener("moments:collections-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("moments:collections-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const assetById = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const a of items) m.set(a.id, a);
    return m;
  }, [items]);

  const handleCreate = useCallback(() => {
    const name = nameInput.trim();
    if (!name) return;
    const next: StoredCollection = {
      id: newId(),
      name,
      coverAssetId: null,
      assetIds: []
    };
    const merged = [...collections, next];
    saveCollections(merged);
    setCollections(merged);
    setNameInput("");
  }, [collections, nameInput]);

  const handleRenameCommit = useCallback(() => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    const merged = collections.map((c) => (c.id === editingId ? { ...c, name } : c));
    saveCollections(merged);
    setCollections(merged);
    setEditingId(null);
  }, [collections, editingId, editingName]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteId) return;
    const merged = collections.filter((c) => c.id !== deleteId);
    saveCollections(merged);
    setCollections(merged);
    setDeleteId(null);
    if (viewId === deleteId) setViewId(null);
  }, [collections, deleteId, viewId]);

  const activeCollection = useMemo(() => collections.find((c) => c.id === viewId) ?? null, [collections, viewId]);

  const visibleAssets = useMemo(() => {
    if (!activeCollection) return [];
    return activeCollection.assetIds.map((id) => assetById.get(id)).filter((a): a is Asset => a != null);
  }, [activeCollection, assetById]);

  const startRename = useCallback((e: MouseEvent, c: StoredCollection) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(c.id);
    setEditingName(c.name);
  }, []);

  const askDelete = useCallback((e: MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteId(id);
  }, []);

  return (
    <div className="collections-root">
      <div className="collections-toolbar">
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Nom de la col·lecció"
          aria-label="Nom de la col·lecció"
        />
        <button type="button" className="btn btn-primary" onClick={handleCreate}>
          Crear col·lecció
        </button>
      </div>

      {viewId && activeCollection ? (
        <section className="collections-detail">
          <div className="collections-detail-head">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewId(null)}>
              ← Totes les col·leccions
            </button>
            <div className="collections-detail-head-main">
              <h2>{activeCollection.name}</h2>
              <p className="modal-muted">{visibleAssets.length} foto(s)</p>
            </div>
            <button
              type="button"
              className="btn btn-icon btn-sm"
              aria-label="Presentació només d’aquesta col·lecció"
              title="Presentació"
              disabled={!visibleAssets.length}
              onClick={() => onPlaySlideshow?.(visibleAssets)}
            >
              <span aria-hidden>▶</span>
            </button>
          </div>
          {visibleAssets.length ? (
            <div className="collections-grid">
              {visibleAssets.map((a) => {
                const url = (a.files.thumbUrl || a.files.previewUrl || a.files.originalUrl).trim();
                return (
                  <figure key={a.id} className="collection-card">
                    {url ? (
                      <div className="collection-card-media">
                        <LazyImage fill src={url} alt={a.title} referrerPolicy="no-referrer" className="collection-card-img" />
                      </div>
                    ) : (
                      <div className="collection-card-placeholder">Sense imatge</div>
                    )}
                    <figcaption>{a.title}</figcaption>
                  </figure>
                );
              })}
            </div>
          ) : (
            <p className="modal-muted">Aquesta col·lecció encara no té fotos. Afegeix-ne des de l’editor de foto.</p>
          )}
        </section>
      ) : (
        <div className="collections-grid">
          {collections.map((c) => {
            const cover = c.coverAssetId ? assetById.get(c.coverAssetId) : null;
            const coverUrl = cover ? (cover.files.thumbUrl || cover.files.previewUrl || cover.files.originalUrl).trim() : "";
            const isEditing = editingId === c.id;
            const slideAssets = c.assetIds.map((id) => assetById.get(id)).filter((a): a is Asset => a != null);

            return (
              <article key={c.id} className="collection-card collection-card--interactive">
                <div className="collection-card-media-wrap">
                  <button
                    type="button"
                    className="collection-card-hit"
                    onClick={() => {
                      if (!isEditing) setViewId(c.id);
                    }}
                    aria-label={`Obrir la col·lecció ${c.name}`}
                  >
                    {coverUrl ? (
                      <div className="collection-card-media collection-card-media--hit">
                        <LazyImage
                          fill
                          src={coverUrl}
                          alt={`Portada: ${c.name}`}
                          referrerPolicy="no-referrer"
                          className="collection-card-hit-img"
                        />
                      </div>
                    ) : (
                      <div className="collection-card-placeholder">{c.name.slice(0, 1).toUpperCase()}</div>
                    )}
                  </button>

                  {isEditing ? (
                    <div className="collection-card-rename" onMouseDown={(e) => e.stopPropagation()}>
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameCommit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="collection-card-rename-input"
                        aria-label="Nou nom de la col·lecció"
                        autoFocus
                      />
                      <div className="collection-card-rename-tools">
                        <button
                          type="button"
                          className="btn btn-icon btn-sm"
                          aria-label="Desar nom"
                          title="Desar"
                          onClick={handleRenameCommit}
                        >
                          <span aria-hidden>✓</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon btn-sm"
                          aria-label="Cancel·lar"
                          title="Cancel·lar"
                          onClick={() => setEditingId(null)}
                        >
                          <span aria-hidden>×</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="collection-card-vignette" aria-hidden />
                      <div className="collection-card-label">
                        <span className="collection-card-title">{c.name}</span>
                        <span className="collection-card-count">{c.assetIds.length} fotos</span>
                      </div>
                    </>
                  )}

                  {!isEditing && onPlaySlideshow ? (
                    <div className="collection-card-play">
                      <button
                        type="button"
                        className="btn btn-icon btn-sm collection-card-play-btn"
                        aria-label={`Presentació: ${c.name}`}
                        title="Presentació d’aquesta col·lecció"
                        disabled={slideAssets.length === 0}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onPlaySlideshow(slideAssets);
                        }}
                      >
                        <span aria-hidden>▶</span>
                      </button>
                    </div>
                  ) : null}

                  {!isEditing ? (
                    <div className="collection-card-tools">
                      <button
                        type="button"
                        className="btn btn-icon btn-sm"
                        aria-label={`Renombrar ${c.name}`}
                        title="Renombrar"
                        onClick={(e) => startRename(e, c)}
                      >
                        <span aria-hidden>✎</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon btn-sm btn-icon--danger"
                        aria-label={`Eliminar la col·lecció ${c.name}`}
                        title="Eliminar"
                        onClick={(e) => askDelete(e, c.id)}
                      >
                        <span aria-hidden>🗑</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {deleteId ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminació"
          onClick={() => setDeleteId(null)}
        >
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <p>Vols eliminar aquesta col·lecció? Les fotos no s’eliminen de la biblioteca.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setDeleteId(null)}>
                Cancel·lar
              </button>
              <button type="button" className="danger" onClick={handleDeleteConfirm}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
