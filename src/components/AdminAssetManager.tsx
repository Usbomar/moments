"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import type { AppCollection } from "@/lib/collections";

type Props = {
  open: boolean;
  assets: Asset[];
  collections: AppCollection[];
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => Promise<void>;
  onQuickUpdate: (asset: Asset, patch: Partial<Asset>) => Promise<void>;
};

type SortKey = "title" | "takenAt" | "color" | "location" | "favorite";
type SortState = { key: SortKey; dir: "asc" | "desc" };
type DraftPatch = Partial<Pick<Asset, "title" | "takenAt" | "favorite" | "colorHue" | "location">>;

const COLOR_PRESETS: Array<{ label: string; hue: number }> = [
  { label: "Rojo", hue: 0 },
  { label: "Naranja", hue: 28 },
  { label: "Amarillo", hue: 55 },
  { label: "Verde", hue: 120 },
  { label: "Cian", hue: 180 },
  { label: "Azul", hue: 220 },
  { label: "Violeta", hue: 275 },
  { label: "Rosa", hue: 330 }
];

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(value: string): string {
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function parseLocationText(value: string) {
  const text = value.trim();
  if (!text) return undefined;
  const [city = "", country = ""] = text.split(",").map((s) => s.trim());
  return { city, country };
}

function colorHueToPreset(hue?: number | null): string {
  if (typeof hue !== "number") return "";
  let closest = COLOR_PRESETS[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const preset of COLOR_PRESETS) {
    const direct = Math.abs(preset.hue - hue);
    const wrapped = 360 - direct;
    const distance = Math.min(direct, wrapped);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = preset;
    }
  }
  return String(closest.hue);
}

export function AdminAssetManager({ open, assets, collections, onClose, onEdit, onDelete, onQuickUpdate }: Props) {
  const [sort, setSort] = useState<SortState[]>([{ key: "takenAt", dir: "desc" }]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const [showMeta, setShowMeta] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const [savingById, setSavingById] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [draftById, setDraftById] = useState<Record<string, DraftPatch>>({});
  const saveTimersRef = useRef<Record<string, number>>({});

  const sorted = useMemo(() => {
    const list = [...assets];
    list.sort((a, b) => {
      for (const s of sort) {
        let left = "";
        let right = "";
        if (s.key === "title") {
          left = a.title ?? "";
          right = b.title ?? "";
        } else if (s.key === "takenAt") {
          left = a.takenAt ?? "";
          right = b.takenAt ?? "";
        } else if (s.key === "location") {
          left = `${a.location?.city ?? ""}, ${a.location?.country ?? ""}`;
          right = `${b.location?.city ?? ""}, ${b.location?.country ?? ""}`;
        } else if (s.key === "color") {
          left = typeof a.colorHue === "number" ? String(a.colorHue) : "";
          right = typeof b.colorHue === "number" ? String(b.colorHue) : "";
        } else {
          left = a.favorite ? "1" : "0";
          right = b.favorite ? "1" : "0";
        }
        const res = cmpText(left, right);
        if (res !== 0) return s.dir === "asc" ? res : -res;
      }
      return 0;
    });
    return list;
  }, [assets, sort]);

  const visibleAssets = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);

  useEffect(() => {
    setVisibleCount(100);
  }, [assets.length, open]);

  useEffect(
    () => () => {
      for (const timer of Object.values(saveTimersRef.current)) {
        window.clearTimeout(timer);
      }
    },
    []
  );

  if (!open) return null;

  const toggleSort = (key: SortKey, keepExisting: boolean) => {
    setSort((prev) => {
      const existing = prev.find((s) => s.key === key);
      if (!keepExisting) {
        if (!existing) return [{ key, dir: "asc" }];
        return [{ key, dir: existing.dir === "asc" ? "desc" : "asc" }];
      }
      const base = [...prev];
      if (existing) {
        const idx = base.findIndex((s) => s.key === key);
        base[idx] = { key, dir: existing.dir === "asc" ? "desc" : "asc" };
      } else {
        base.push({ key, dir: "asc" });
      }
      return base.slice(-2);
    });
  };

  const getCollectionCount = (assetId: string) => collections.filter((c) => c.assetIds.includes(assetId)).length;

  const scheduleSave = (asset: Asset, patch: DraftPatch) => {
    if (saveTimersRef.current[asset.id]) window.clearTimeout(saveTimersRef.current[asset.id]);
    setSavingById((prev) => ({ ...prev, [asset.id]: "saving" }));
    saveTimersRef.current[asset.id] = window.setTimeout(async () => {
      try {
        await onQuickUpdate(asset, patch);
        setSavingById((prev) => ({ ...prev, [asset.id]: "saved" }));
        setTimeout(() => {
          setSavingById((prev) => ({ ...prev, [asset.id]: "idle" }));
        }, 900);
      } catch {
        setSavingById((prev) => ({ ...prev, [asset.id]: "error" }));
      }
    }, 400);
  };

  const updateDraft = (asset: Asset, patch: DraftPatch) => {
    setDraftById((prev) => ({ ...prev, [asset.id]: { ...(prev[asset.id] ?? {}), ...patch } }));
    scheduleSave(asset, patch);
  };

  const loadMore = () => setVisibleCount((prev) => Math.min(prev + 100, sorted.length));

  return (
    <div className="modal-overlay modal-overlay--front admin-assets-overlay" role="dialog" aria-modal="true" aria-label="Administrador de fotos" onClick={onClose}>
      <div className="modal-content admin-assets-modal admin-assets-modal--fullscreen" onClick={(e) => e.stopPropagation()}>
        <header className="admin-assets-head">
          <h2>Administrador de fotos</h2>
          <div className="admin-assets-head-actions">
            <label className="admin-assets-toggle">
              <input type="checkbox" checked={showMeta} onChange={(e) => setShowMeta(e.target.checked)} />
              Metadatos
            </label>
            <label className="admin-assets-toggle">
              <input type="checkbox" checked={showContent} onChange={(e) => setShowContent(e.target.checked)} />
              Contenido
            </label>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="admin-assets-table-wrap">
          <table className="admin-assets-table">
            <thead>
              <tr>
                <th className="admin-assets-col-thumb">Mini</th>
                <th>
                  <button type="button" onClick={(e) => toggleSort("title", e.shiftKey)}>Nombre</button>
                </th>
                <th>
                  <button type="button" onClick={(e) => toggleSort("takenAt", e.shiftKey)}>Fecha</button>
                </th>
                <th>
                  <button type="button" onClick={(e) => toggleSort("color", e.shiftKey)}>Color</button>
                </th>
                <th>
                  <button type="button" onClick={(e) => toggleSort("location", e.shiftKey)}>Ubicación</button>
                </th>
                <th>
                  <button type="button" onClick={(e) => toggleSort("favorite", e.shiftKey)}>Fav</button>
                </th>
                {showContent ? <th title="Descripción">📝</th> : null}
                {showContent ? <th title="Tags">🏷</th> : null}
                {showMeta ? <th title="Colecciones">📚</th> : null}
                <th className="admin-assets-col-delete">X</th>
              </tr>
            </thead>
            <tbody>
              {visibleAssets.map((a) => {
                const thumb = (a.files.thumbUrl || a.files.previewUrl || a.files.originalUrl).trim();
                const locationText = `${draftById[a.id]?.location?.city ?? a.location?.city ?? ""}${(draftById[a.id]?.location?.country ?? a.location?.country) ? `, ${draftById[a.id]?.location?.country ?? a.location?.country ?? ""}` : ""}`;
                const saveState = savingById[a.id] ?? "idle";
                return (
                <tr key={a.id}>
                  <td className="admin-assets-col-thumb">
                    <button type="button" className="admin-assets-thumb-btn" onClick={() => onEdit(a)} aria-label={`Editar ${a.title}`}>
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote storage image
                        <img src={thumb} alt={a.title} className="admin-assets-thumb" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="admin-assets-thumb admin-assets-thumb--empty">·</span>
                      )}
                    </button>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={draftById[a.id]?.title ?? a.title}
                      onChange={(e) => updateDraft(a, { title: e.target.value })}
                    />
                    <span className={`admin-assets-save admin-assets-save--${saveState}`}>
                      {saveState === "saving" ? "guardando..." : saveState === "saved" ? "guardado" : saveState === "error" ? "error" : ""}
                    </span>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={toDateInputValue(draftById[a.id]?.takenAt ?? a.takenAt)}
                      onChange={(e) => updateDraft(a, { takenAt: fromDateInputValue(e.target.value) })}
                    />
                  </td>
                  <td>
                    <select
                      value={colorHueToPreset(draftById[a.id]?.colorHue ?? a.colorHue)}
                      onChange={(e) => updateDraft(a, { colorHue: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Sin color</option>
                      {COLOR_PRESETS.map((preset) => (
                        <option key={preset.hue} value={preset.hue}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={locationText}
                      placeholder="Ciudad, país"
                      onChange={(e) => {
                        const parsed = parseLocationText(e.target.value);
                        updateDraft(a, {
                          location: parsed
                            ? {
                                lat: a.location?.lat ?? 0,
                                lng: a.location?.lng ?? 0,
                                city: parsed.city,
                                country: parsed.country
                              }
                            : undefined
                        });
                      }}
                    />
                  </td>
                  <td>
                    <input type="checkbox" checked={draftById[a.id]?.favorite ?? a.favorite} onChange={(e) => updateDraft(a, { favorite: e.target.checked })} />
                  </td>
                  {showContent ? <td>{a.description?.trim() ? "●" : ""}</td> : null}
                  {showContent ? <td>{a.tags?.length ? "●" : ""}</td> : null}
                  {showMeta ? <td>{getCollectionCount(a.id) ? "●" : ""}</td> : null}
                  <td className="admin-assets-col-delete">
                    <button
                        type="button"
                        className="btn btn-sm danger admin-assets-delete"
                        disabled={busyId === a.id}
                        onClick={async () => {
                          if (!confirm(`¿Eliminar "${a.title}"? Esta acción no se puede deshacer.`)) return;
                          setBusyId(a.id);
                          try {
                            await onDelete(a);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        ×
                      </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {visibleCount < sorted.length ? (
            <div className="admin-assets-load-more">
              <button type="button" className="btn btn-sm" onClick={loadMore}>
                Cargar más
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

