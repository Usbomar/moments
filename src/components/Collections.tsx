"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Asset } from "@/lib/types";
import { loadCollections, saveCollections, type StoredCollection } from "@/lib/collections-storage";
import { LazyImage } from "@/components/LazyImage";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c-${Date.now()}`;
}

interface Props {
  items: Asset[];
}

export function Collections({ items }: Props) {
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
            <h2>{activeCollection.name}</h2>
            <p className="modal-muted">{visibleAssets.length} foto(s)</p>
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
            return (
              <article key={c.id} className="collection-card collection-card--interactive">
                <button type="button" className="collection-card-hit" onClick={() => setViewId(c.id)} aria-label={`Obrir ${c.name}`}>
                  {coverUrl ? (
                    <div className="collection-card-media collection-card-media--hit">
                      <LazyImage
                        fill
                        src={coverUrl}
                        alt={`Portada de la col·lecció ${c.name}`}
                        referrerPolicy="no-referrer"
                        className="collection-card-hit-img"
                      />
                    </div>
                  ) : (
                    <div className="collection-card-placeholder">{c.name.slice(0, 1).toUpperCase()}</div>
                  )}
                </button>
                <div className="collection-card-meta">
                  {editingId === c.id ? (
                    <>
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameCommit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        aria-label="Editar nom"
                      />
                      <button type="button" onClick={handleRenameCommit}>
                        Desar
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}>
                        Cancel·lar
                      </button>
                    </>
                  ) : (
                    <>
                      <h3>{c.name}</h3>
                      <p className="modal-muted">{c.assetIds.length} elements</p>
                      <div className="collection-card-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(c.id);
                            setEditingName(c.name);
                          }}
                        >
                          Renombrar
                        </button>
                        <button type="button" className="danger" onClick={() => setDeleteId(c.id)}>
                          Eliminar
                        </button>
                      </div>
                    </>
                  )}
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
