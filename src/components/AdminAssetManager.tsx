"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import type { AppCollection } from "@/lib/collections";
import { Collections } from "@/components/Collections";

type Props = {
  open: boolean;
  assets: Asset[];
  collections: AppCollection[];
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onEditImage: (asset: Asset) => void;
  onDelete: (asset: Asset) => Promise<void>;
  onQuickUpdate: (asset: Asset, patch: Partial<Asset>) => Promise<void>;
};

type SortKey = "title" | "takenAt" | "color" | "location" | "favorite";
type SortState = { key: SortKey; dir: "asc" | "desc" };
type DraftPatch = Partial<Pick<Asset, "title" | "takenAt" | "favorite" | "colorHue" | "location">>;

const COLOR_PRESETS: Array<{ label: string; hue: number }> = [
  { label: "Rojo", hue: 0 },
  { label: "Rojo anaranjado", hue: 15 },
  { label: "Naranja", hue: 30 },
  { label: "Ámbar", hue: 45 },
  { label: "Amarillo", hue: 60 },
  { label: "Lima", hue: 75 },
  { label: "Verde lima", hue: 95 },
  { label: "Verde", hue: 120 },
  { label: "Verde menta", hue: 145 },
  { label: "Turquesa", hue: 165 },
  { label: "Cian", hue: 180 },
  { label: "Azul cielo", hue: 200 },
  { label: "Azul", hue: 220 },
  { label: "Índigo", hue: 240 },
  { label: "Violeta", hue: 275 },
  { label: "Púrpura", hue: 290 },
  { label: "Magenta", hue: 310 },
  { label: "Rosa", hue: 330 },
  { label: "Coral", hue: 345 },
  { label: "Marrón", hue: 24 }
];
const CUSTOM_COLOR_STORAGE_KEY = "moments_admin_custom_colors_v1";
type TabId = "photos" | "collections" | "tags" | "locations" | "colors";

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

function colorHueToPreset(hue: number | null | undefined, options: Array<{ label: string; hue: number }>): string {
  if (typeof hue !== "number") return "";
  let closest = options[0] ?? COLOR_PRESETS[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const preset of options) {
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

function hexToHue(hex: string): number | null {
  const clean = hex.trim();
  const valid = /^#([0-9a-f]{6})$/i.test(clean);
  if (!valid) return null;
  const r = Number.parseInt(clean.slice(1, 3), 16) / 255;
  const g = Number.parseInt(clean.slice(3, 5), 16) / 255;
  const b = Number.parseInt(clean.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  const deg = Math.round(hue * 60);
  return deg < 0 ? deg + 360 : deg;
}

export function AdminAssetManager({ open, assets, collections, onClose, onEdit, onEditImage, onDelete, onQuickUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("photos");
  const [sort, setSort] = useState<SortState[]>([{ key: "takenAt", dir: "desc" }]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const [showMeta, setShowMeta] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const [savingById, setSavingById] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [draftById, setDraftById] = useState<Record<string, DraftPatch>>({});
  const [customColors, setCustomColors] = useState<Array<{ label: string; hue: number }>>([]);
  const [newColorHex, setNewColorHex] = useState("#ff7a00");
  const [newColorName, setNewColorName] = useState("");
  const [previewAsset, setPreviewAsset] = useState<{ asset: Asset; src: string; title: string } | null>(null);
  const [editingColorHue, setEditingColorHue] = useState<number | null>(null);
  const [editingColorName, setEditingColorName] = useState("");
  const saveTimersRef = useRef<Record<string, number>>({});
  const allColorOptions = useMemo(() => [...COLOR_PRESETS, ...customColors], [customColors]);
  const tagStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) {
      const seen = new Set<string>();
      for (const raw of asset.tags ?? []) {
        const tag = raw.trim().toLowerCase();
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([value, total]) => ({ value, total }))
      .sort((a, b) => a.value.localeCompare(b.value, "ca", { sensitivity: "base", numeric: true }));
  }, [assets]);
  const locationStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) {
      const city = asset.location?.city?.trim() ?? "";
      const country = asset.location?.country?.trim() ?? "";
      const key = [city, country].filter(Boolean).join(", ");
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, total]) => ({ value, total }))
      .sort((a, b) => a.value.localeCompare(b.value, "ca", { sensitivity: "base", numeric: true }));
  }, [assets]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CUSTOM_COLOR_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<{ label?: string; hue?: number }>;
      const safe = parsed
        .filter((x) => typeof x?.hue === "number")
        .map((x, idx) => ({
          label: x.label?.trim() || `Personalitzat ${idx + 1}`,
          hue: Math.max(0, Math.min(359, Math.round(x.hue!)))
        }));
      setCustomColors(safe);
    } catch {
      setCustomColors([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CUSTOM_COLOR_STORAGE_KEY, JSON.stringify(customColors));
  }, [customColors]);

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
  const addCustomColor = () => {
    const hue = hexToHue(newColorHex);
    if (hue === null) return;
    if (allColorOptions.some((c) => Math.abs(c.hue - hue) <= 1)) return;
    const label = newColorName.trim() || `Personalitzat ${customColors.length + 1}`;
    setCustomColors((prev) => [...prev, { label, hue }]);
    setNewColorName("");
  };
  const startEditColor = (hue: number, label: string) => {
    setEditingColorHue(hue);
    setEditingColorName(label);
  };
  const commitEditColor = () => {
    if (editingColorHue === null) return;
    const next = editingColorName.trim();
    if (!next) return;
    setCustomColors((prev) => prev.map((c) => (c.hue === editingColorHue ? { ...c, label: next } : c)));
    setEditingColorHue(null);
    setEditingColorName("");
  };
  const removeCustomColor = (hue: number) => {
    setCustomColors((prev) => prev.filter((c) => c.hue !== hue));
    if (editingColorHue === hue) {
      setEditingColorHue(null);
      setEditingColorName("");
    }
  };

  return (
    <div className="modal-overlay modal-overlay--front admin-assets-overlay" role="dialog" aria-modal="true" aria-label="Configuració de la biblioteca" onClick={onClose}>
      <div className="modal-content admin-assets-modal admin-assets-modal--fullscreen" onClick={(e) => e.stopPropagation()}>
        <header className="admin-assets-head">
          <h2>Configuració</h2>
          <div className="admin-assets-head-actions">
            <div className="admin-tabs" role="tablist" aria-label="Pestanyes de configuració">
              <button type="button" role="tab" aria-selected={activeTab === "photos"} className={activeTab === "photos" ? "is-active" : ""} onClick={() => setActiveTab("photos")}>Fotos</button>
              <button type="button" role="tab" aria-selected={activeTab === "collections"} className={activeTab === "collections" ? "is-active" : ""} onClick={() => setActiveTab("collections")}>Col·leccions</button>
              <button type="button" role="tab" aria-selected={activeTab === "tags"} className={activeTab === "tags" ? "is-active" : ""} onClick={() => setActiveTab("tags")}>Tags</button>
              <button type="button" role="tab" aria-selected={activeTab === "locations"} className={activeTab === "locations" ? "is-active" : ""} onClick={() => setActiveTab("locations")}>Ubicacions</button>
              <button type="button" role="tab" aria-selected={activeTab === "colors"} className={activeTab === "colors" ? "is-active" : ""} onClick={() => setActiveTab("colors")}>Colors</button>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Tancar">
            ×
          </button>
        </header>

        {activeTab === "photos" ? (
        <>
        <div className="admin-assets-subhead">
          <label className="admin-assets-toggle">
            <input type="checkbox" checked={showMeta} onChange={(e) => setShowMeta(e.target.checked)} />
            Metadades
          </label>
          <label className="admin-assets-toggle">
            <input type="checkbox" checked={showContent} onChange={(e) => setShowContent(e.target.checked)} />
            Contingut
          </label>
        </div>
        <div className="admin-assets-table-wrap">
          <table className="admin-assets-table">
            <thead>
              <tr>
                <th className="admin-assets-col-thumb">Mini</th>
                <th>
                  <button type="button" onClick={(e) => toggleSort("title", e.shiftKey)}>Nom</button>
                </th>
                <th>
                  <button type="button" onClick={(e) => toggleSort("takenAt", e.shiftKey)}>Data</button>
                </th>
                <th>
                  <button type="button" onClick={(e) => toggleSort("color", e.shiftKey)}>Color</button>
                </th>
                <th>
                  <button type="button" onClick={(e) => toggleSort("location", e.shiftKey)}>Ubicació</button>
                </th>
                <th>
                  <button type="button" onClick={(e) => toggleSort("favorite", e.shiftKey)}>Preferit</button>
                </th>
                {showContent ? <th title="Descripción">📝</th> : null}
                {showContent ? <th title="Tags">🏷</th> : null}
                {showMeta ? <th title="Col·leccions">📚</th> : null}
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
                    <div className="admin-assets-thumb-wrap">
                      <button
                        type="button"
                        className="admin-assets-thumb-btn"
                        onClick={() => {
                          if (!thumb) return;
                          setPreviewAsset({ asset: a, src: a.files.previewUrl || a.files.originalUrl || thumb, title: a.title });
                        }}
                        aria-label={`Ampliar ${a.title}`}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element -- remote storage image
                          <img src={thumb} alt={a.title} className="admin-assets-thumb" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="admin-assets-thumb admin-assets-thumb--empty">·</span>
                        )}
                      </button>
                      {thumb ? (
                        <div className="admin-assets-hover-preview" aria-hidden>
                          {/* eslint-disable-next-line @next/next/no-img-element -- remote storage image */}
                          <img src={thumb} alt="" referrerPolicy="no-referrer" />
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <div className="admin-assets-title-cell">
                      <input
                        type="text"
                        value={draftById[a.id]?.title ?? a.title}
                        onChange={(e) => updateDraft(a, { title: e.target.value })}
                      />
                      <span className={`admin-assets-save admin-assets-save--${saveState}`}>
                        {saveState === "saving" ? "desant..." : saveState === "saved" ? "desat" : saveState === "error" ? "error" : ""}
                      </span>
                    </div>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={toDateInputValue(draftById[a.id]?.takenAt ?? a.takenAt)}
                      onChange={(e) => updateDraft(a, { takenAt: fromDateInputValue(e.target.value) })}
                    />
                  </td>
                  <td>
                    <span className="admin-assets-inline-color">
                      <span
                        className="admin-assets-color-chip"
                        style={{ backgroundColor: `hsl(${draftById[a.id]?.colorHue ?? a.colorHue ?? 0} 72% 46%)`, opacity: typeof (draftById[a.id]?.colorHue ?? a.colorHue) === "number" ? 1 : 0.2 }}
                        aria-hidden
                      />
                    <select
                      value={colorHueToPreset(draftById[a.id]?.colorHue ?? a.colorHue, allColorOptions)}
                      onChange={(e) => updateDraft(a, { colorHue: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Sense color</option>
                      {allColorOptions.map((preset) => (
                        <option key={preset.hue} value={preset.hue}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    </span>
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
                    <label className="admin-assets-checkbox-wrap" aria-label={`Favorito ${a.title}`}>
                      <input
                        type="checkbox"
                        checked={draftById[a.id]?.favorite ?? a.favorite}
                        onChange={(e) => updateDraft(a, { favorite: e.target.checked })}
                      />
                    </label>
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
                          if (!confirm(`Vols eliminar "${a.title}"? Aquesta acció no es pot desfer.`)) return;
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
                Carregar més
              </button>
            </div>
          ) : null}
        </div>
        </>
        ) : null}

        {activeTab === "collections" ? (
          <div className="admin-tab-panel">
            <Collections items={assets} />
          </div>
        ) : null}

        {activeTab === "tags" ? (
          <div className="admin-tab-panel">
            <table className="admin-stats-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Total d&apos;usos</th>
                </tr>
              </thead>
              <tbody>
                {tagStats.map((row) => (
                  <tr key={row.value}>
                    <td>{row.value}</td>
                    <td>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === "locations" ? (
          <div className="admin-tab-panel">
            <table className="admin-stats-table">
              <thead>
                <tr>
                  <th>Ubicació</th>
                  <th>Total d&apos;usos</th>
                </tr>
              </thead>
              <tbody>
                {locationStats.map((row) => (
                  <tr key={row.value}>
                    <td>{row.value}</td>
                    <td>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === "colors" ? (
          <div className="admin-tab-panel">
            <div className="admin-assets-custom-color">
              <input type="color" value={newColorHex} onChange={(e) => setNewColorHex(e.target.value)} aria-label="Escull color personalitzat" />
              <input type="text" value={newColorName} onChange={(e) => setNewColorName(e.target.value)} placeholder="Nom del color" />
              <button type="button" className="btn btn-sm" onClick={addCustomColor}>Afegir color</button>
            </div>
            <table className="admin-stats-table">
              <thead>
                <tr>
                  <th>Mostra</th>
                  <th>Nom</th>
                  <th>Accions</th>
                </tr>
              </thead>
              <tbody>
                {customColors.map((color) => (
                  <tr key={color.hue}>
                    <td><span className="admin-assets-color-chip" style={{ backgroundColor: `hsl(${color.hue} 72% 46%)` }} /></td>
                    <td>
                      {editingColorHue === color.hue ? (
                        <input type="text" value={editingColorName} onChange={(e) => setEditingColorName(e.target.value)} />
                      ) : (
                        color.label
                      )}
                    </td>
                    <td className="admin-color-actions">
                      {editingColorHue === color.hue ? (
                        <>
                          <button type="button" className="btn btn-sm" onClick={commitEditColor}>Desar</button>
                          <button type="button" className="btn btn-sm" onClick={() => setEditingColorHue(null)}>Cancel·lar</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn btn-sm" onClick={() => startEditColor(color.hue, color.label)}>Editar</button>
                          <button type="button" className="btn btn-sm danger" onClick={() => removeCustomColor(color.hue)}>Eliminar</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {previewAsset ? (
        <div className="admin-assets-preview-overlay" role="dialog" aria-modal="true" aria-label={`Vista ampliada de ${previewAsset.title}`} onClick={() => setPreviewAsset(null)}>
          <div className="admin-assets-preview-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn btn-ghost btn-sm admin-assets-preview-close" onClick={() => setPreviewAsset(null)} aria-label="Tancar vista ampliada">
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- remote storage image */}
            <img src={previewAsset.src} alt={previewAsset.title} className="admin-assets-preview-image" referrerPolicy="no-referrer" />
            <div className="admin-assets-preview-caption">{previewAsset.title}</div>
            <div className="viewer-toolbar" role="toolbar" aria-label="Accions de la foto">
              <button type="button" className="viewer-toolbar-btn viewer-toolbar-btn--primary" onClick={() => {
                onEdit(previewAsset.asset);
              }}>
                Editar dades
              </button>
              <button type="button" className="viewer-toolbar-btn" onClick={() => {
                onEditImage(previewAsset.asset);
              }}>
                Editar imatge
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

