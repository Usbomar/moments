"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import type { AppCollection } from "@/lib/collections";

type Props = {
  open: boolean;
  assets: Asset[];
  collections: AppCollection[];
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onEditImage: (asset: Asset) => void;
  onDelete: (asset: Asset) => Promise<void>;
  onQuickUpdate: (asset: Asset, patch: Partial<Asset>) => Promise<void>;
  onRefreshCollections?: () => Promise<void>;
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

export function AdminAssetManager({ open, assets, collections, onClose, onEdit, onEditImage, onDelete, onQuickUpdate, onRefreshCollections }: Props) {
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
  const [previewAsset, setPreviewAsset] = useState<{ assetId: string; sourceIds: string[] } | null>(null);
  const [previewZoom, setPreviewZoom] = useState<1 | 2>(1);
  const [editingColorHue, setEditingColorHue] = useState<number | null>(null);
  const [editingColorName, setEditingColorName] = useState("");
  const [openTagRows, setOpenTagRows] = useState<Record<string, boolean>>({});
  const [openLocationRows, setOpenLocationRows] = useState<Record<string, boolean>>({});
  const [openCollectionRows, setOpenCollectionRows] = useState<Record<string, boolean>>({});
  const [editingTagName, setEditingTagName] = useState<Record<string, string>>({});
  const [editingLocationName, setEditingLocationName] = useState<Record<string, string>>({});
  const [addAssetByTag, setAddAssetByTag] = useState<Record<string, string>>({});
  const [addAssetByLocation, setAddAssetByLocation] = useState<Record<string, string>>({});
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
  const tagsToAssets = useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const asset of assets) {
      for (const tagRaw of asset.tags ?? []) {
        const tag = tagRaw.trim().toLowerCase();
        if (!tag) continue;
        const arr = map.get(tag) ?? [];
        arr.push(asset);
        map.set(tag, arr);
      }
    }
    return map;
  }, [assets]);
  const locationsToAssets = useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const asset of assets) {
      const key = [asset.location?.city?.trim() ?? "", asset.location?.country?.trim() ?? ""].filter(Boolean).join(", ");
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(asset);
      map.set(key, arr);
    }
    return map;
  }, [assets]);
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

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
  const toggleTagRow = (tag: string) => setOpenTagRows((prev) => ({ ...prev, [tag]: !prev[tag] }));
  const toggleLocationRow = (loc: string) => setOpenLocationRows((prev) => ({ ...prev, [loc]: !prev[loc] }));
  const toggleCollectionRow = (id: string) => setOpenCollectionRows((prev) => ({ ...prev, [id]: !prev[id] }));
  const removeTagFromAsset = async (asset: Asset, tag: string) => {
    const nextTags = (asset.tags ?? []).filter((t) => t.trim().toLowerCase() !== tag);
    await onQuickUpdate(asset, { tags: nextTags } as Partial<Asset>);
  };
  const addTagToAsset = async (asset: Asset, tag: string) => {
    const normalized = tag.trim().toLowerCase();
    const next = [...(asset.tags ?? [])];
    if (!next.map((t) => t.trim().toLowerCase()).includes(normalized)) next.push(normalized);
    await onQuickUpdate(asset, { tags: next } as Partial<Asset>);
  };
  const renameTag = async (oldTag: string) => {
    const nextTag = (editingTagName[oldTag] ?? "").trim().toLowerCase();
    if (!nextTag || nextTag === oldTag) return;
    const list = tagsToAssets.get(oldTag) ?? [];
    await Promise.all(
      list.map((asset) => {
        const tags = (asset.tags ?? []).map((t) => (t.trim().toLowerCase() === oldTag ? nextTag : t.trim().toLowerCase()));
        return onQuickUpdate(asset, { tags } as Partial<Asset>);
      })
    );
  };
  const deleteTagEverywhere = async (tag: string) => {
    const list = tagsToAssets.get(tag) ?? [];
    await Promise.all(list.map((asset) => removeTagFromAsset(asset, tag)));
  };
  const removeLocationFromAsset = async (asset: Asset) => {
    await onQuickUpdate(asset, { location: undefined } as Partial<Asset>);
  };
  const setLocationOnAsset = async (asset: Asset, city: string, country: string) => {
    await onQuickUpdate(
      asset,
      {
        location: {
          lat: asset.location?.lat ?? 0,
          lng: asset.location?.lng ?? 0,
          city,
          country
        }
      } as Partial<Asset>
    );
  };
  const renameLocation = async (oldLocation: string) => {
    const next = (editingLocationName[oldLocation] ?? "").trim();
    if (!next || next === oldLocation) return;
    const [city = "", country = ""] = next.split(",").map((s) => s.trim());
    const list = locationsToAssets.get(oldLocation) ?? [];
    await Promise.all(list.map((asset) => setLocationOnAsset(asset, city, country)));
  };
  const deleteLocationEverywhere = async (locationKey: string) => {
    const list = locationsToAssets.get(locationKey) ?? [];
    await Promise.all(list.map((asset) => removeLocationFromAsset(asset)));
  };
  const toggleAssetInCollection = async (collection: AppCollection, assetId: string, include: boolean) => {
    const res = await fetch(`/api/collections/${collection.id}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, include })
    });
    if (!res.ok) return;
    if (onRefreshCollections) await onRefreshCollections();
  };
  const openPreview = (asset: Asset, sourceAssets: Asset[]) => {
    setPreviewZoom(1);
    setPreviewAsset({
      assetId: asset.id,
      sourceIds: sourceAssets.map((x) => x.id)
    });
  };
  const previewCurrent = previewAsset ? assetById.get(previewAsset.assetId) ?? null : null;
  const previewSourceAssets = previewAsset
    ? previewAsset.sourceIds.map((id) => assetById.get(id)).filter((x): x is Asset => Boolean(x))
    : [];
  const previewIndex = previewCurrent ? previewSourceAssets.findIndex((x) => x.id === previewCurrent.id) : -1;
  const previewCanPrev = previewIndex > 0;
  const previewCanNext = previewIndex >= 0 && previewIndex < previewSourceAssets.length - 1;
  const previewSrc = previewCurrent ? (previewCurrent.files.previewUrl || previewCurrent.files.originalUrl || previewCurrent.files.thumbUrl).trim() : "";

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
                          openPreview(a, visibleAssets);
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
            <table className="admin-stats-table">
              <thead>
                <tr>
                  <th>Col·lecció</th>
                  <th>Total</th>
                  <th>Fotos</th>
                </tr>
              </thead>
              <tbody>
                {collections.map((collection) => (
                  <Fragment key={collection.id}>
                    <tr>
                      <td>{collection.name}</td>
                      <td>{collection.assetIds.length}</td>
                      <td>
                        <button type="button" className="btn btn-sm" onClick={() => toggleCollectionRow(collection.id)}>
                          {openCollectionRows[collection.id] ? "Amagar" : "Mostrar"}
                        </button>
                      </td>
                    </tr>
                    {openCollectionRows[collection.id] ? (
                      <tr key={`${collection.id}-assets`} className="admin-stats-expanded-row">
                        <td colSpan={3}>
                          <div className="admin-linked-thumbs">
                            {collection.assetIds.map((assetId) => {
                              const asset = assetById.get(assetId);
                              if (!asset) return null;
                              const thumb = (asset.files.thumbUrl || asset.files.previewUrl || asset.files.originalUrl).trim();
                              const included = collection.assetIds.includes(asset.id);
                              return (
                                <label key={`${collection.id}-${asset.id}`} className="admin-linked-thumb-item admin-linked-thumb-item--check">
                                  <input
                                    type="checkbox"
                                    checked={included}
                                    onChange={(e) => {
                                      void toggleAssetInCollection(collection, asset.id, e.target.checked);
                                    }}
                                  />
                                  <button type="button" onClick={() => openPreview(asset, collection.assetIds.map((id) => assetById.get(id)).filter((x): x is Asset => Boolean(x)))}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- remote storage image */}
                                    <img src={thumb} alt={asset.title} referrerPolicy="no-referrer" />
                                  </button>
                                </label>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === "tags" ? (
          <div className="admin-tab-panel">
            <table className="admin-stats-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Total d&apos;usos</th>
                  <th>Accions</th>
                </tr>
              </thead>
              <tbody>
                {tagStats.map((row) => {
                  const linked = tagsToAssets.get(row.value) ?? [];
                  const currentEdit = editingTagName[row.value] ?? row.value;
                  const addable = assets.filter((asset) => !(asset.tags ?? []).map((t) => t.trim().toLowerCase()).includes(row.value));
                  return (
                    <Fragment key={row.value}>
                      <tr>
                        <td>
                          <input
                            type="text"
                            value={currentEdit}
                            onChange={(e) => setEditingTagName((prev) => ({ ...prev, [row.value]: e.target.value }))}
                          />
                        </td>
                        <td>{row.total}</td>
                        <td className="admin-color-actions">
                          <button type="button" className="btn btn-sm" onClick={() => void renameTag(row.value)}>Desar nom</button>
                          <button type="button" className="btn btn-sm" onClick={() => toggleTagRow(row.value)}>
                            {openTagRows[row.value] ? "Amagar fotos" : "Mostrar fotos"}
                          </button>
                          <button type="button" className="btn btn-sm danger" onClick={() => void deleteTagEverywhere(row.value)}>Eliminar</button>
                        </td>
                      </tr>
                      {openTagRows[row.value] ? (
                        <tr key={`${row.value}-photos`} className="admin-stats-expanded-row">
                          <td colSpan={3}>
                            <div className="admin-linked-thumbs">
                              {linked.slice(0, 8).map((asset) => {
                                const thumb = (asset.files.thumbUrl || asset.files.previewUrl || asset.files.originalUrl).trim();
                                return (
                                  <div key={`${row.value}-${asset.id}`} className="admin-linked-thumb-item">
                                    <button type="button" onClick={() => openPreview(asset, linked)}>
                                      {/* eslint-disable-next-line @next/next/no-img-element -- remote storage image */}
                                      <img src={thumb} alt={asset.title} referrerPolicy="no-referrer" />
                                    </button>
                                    <button type="button" className="btn btn-sm danger" onClick={() => void removeTagFromAsset(asset, row.value)}>Treure</button>
                                  </div>
                                );
                              })}
                            </div>
                            {linked.length > 8 ? <p className="modal-muted">+ {linked.length - 8} fotos més</p> : null}
                            <div className="admin-inline-add">
                              <select value={addAssetByTag[row.value] ?? ""} onChange={(e) => setAddAssetByTag((prev) => ({ ...prev, [row.value]: e.target.value }))}>
                                <option value="">Afegir foto al tag…</option>
                                {addable.map((asset) => (
                                  <option key={asset.id} value={asset.id}>{asset.title}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => {
                                  const selectedId = addAssetByTag[row.value];
                                  if (!selectedId) return;
                                  const asset = assetById.get(selectedId);
                                  if (!asset) return;
                                  void addTagToAsset(asset, row.value);
                                }}
                              >
                                Afegir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
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
                  <th>Accions</th>
                </tr>
              </thead>
              <tbody>
                {locationStats.map((row) => {
                  const linked = locationsToAssets.get(row.value) ?? [];
                  const currentEdit = editingLocationName[row.value] ?? row.value;
                  const [city = "", country = ""] = row.value.split(",").map((s) => s.trim());
                  const addable = assets.filter((asset) => {
                    const key = [asset.location?.city?.trim() ?? "", asset.location?.country?.trim() ?? ""].filter(Boolean).join(", ");
                    return key !== row.value;
                  });
                  return (
                    <Fragment key={row.value}>
                      <tr>
                        <td>
                          <input type="text" value={currentEdit} onChange={(e) => setEditingLocationName((prev) => ({ ...prev, [row.value]: e.target.value }))} />
                        </td>
                        <td>{row.total}</td>
                        <td className="admin-color-actions">
                          <button type="button" className="btn btn-sm" onClick={() => void renameLocation(row.value)}>Desar nom</button>
                          <button type="button" className="btn btn-sm" onClick={() => toggleLocationRow(row.value)}>
                            {openLocationRows[row.value] ? "Amagar fotos" : "Mostrar fotos"}
                          </button>
                          <button type="button" className="btn btn-sm danger" onClick={() => void deleteLocationEverywhere(row.value)}>Eliminar</button>
                        </td>
                      </tr>
                      {openLocationRows[row.value] ? (
                        <tr key={`${row.value}-photos`} className="admin-stats-expanded-row">
                          <td colSpan={3}>
                            <div className="admin-linked-thumbs">
                              {linked.slice(0, 8).map((asset) => {
                                const thumb = (asset.files.thumbUrl || asset.files.previewUrl || asset.files.originalUrl).trim();
                                return (
                                  <div key={`${row.value}-${asset.id}`} className="admin-linked-thumb-item">
                                    <button type="button" onClick={() => openPreview(asset, linked)}>
                                      {/* eslint-disable-next-line @next/next/no-img-element -- remote storage image */}
                                      <img src={thumb} alt={asset.title} referrerPolicy="no-referrer" />
                                    </button>
                                    <button type="button" className="btn btn-sm danger" onClick={() => void removeLocationFromAsset(asset)}>Treure</button>
                                  </div>
                                );
                              })}
                            </div>
                            {linked.length > 8 ? <p className="modal-muted">+ {linked.length - 8} fotos més</p> : null}
                            <div className="admin-inline-add">
                              <select value={addAssetByLocation[row.value] ?? ""} onChange={(e) => setAddAssetByLocation((prev) => ({ ...prev, [row.value]: e.target.value }))}>
                                <option value="">Afegir foto a ubicació…</option>
                                {addable.map((asset) => (
                                  <option key={asset.id} value={asset.id}>{asset.title}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => {
                                  const selectedId = addAssetByLocation[row.value];
                                  if (!selectedId) return;
                                  const asset = assetById.get(selectedId);
                                  if (!asset) return;
                                  void setLocationOnAsset(asset, city, country);
                                }}
                              >
                                Afegir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
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
      {previewCurrent ? (
        <div className="admin-assets-preview-overlay" role="dialog" aria-modal="true" aria-label={`Vista ampliada de ${previewCurrent.title}`} onClick={() => setPreviewAsset(null)}>
          <div className="admin-assets-preview-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn btn-ghost btn-sm admin-assets-preview-close" onClick={() => setPreviewAsset(null)} aria-label="Tancar vista ampliada">
              ×
            </button>
            {previewSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote storage image
              <img
                src={previewSrc}
                alt={previewCurrent.title}
                className={`admin-assets-preview-image ${previewZoom === 2 ? "is-zoomed" : ""}`}
                referrerPolicy="no-referrer"
              />
            ) : null}
            <div className="admin-assets-preview-caption">{previewCurrent.title}</div>
            <div className="admin-assets-preview-nav">
              <button type="button" className="btn btn-sm" disabled={!previewCanPrev} onClick={() => {
                if (!previewCanPrev) return;
                const prev = previewSourceAssets[previewIndex - 1];
                if (!prev) return;
                setPreviewAsset((state) => (state ? { ...state, assetId: prev.id } : state));
              }}>
                ←
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setPreviewZoom((z) => (z === 1 ? 2 : 1))}>
                {previewZoom === 1 ? "Zoom x2" : "Zoom x1"}
              </button>
              <button type="button" className="btn btn-sm" disabled={!previewCanNext} onClick={() => {
                if (!previewCanNext) return;
                const next = previewSourceAssets[previewIndex + 1];
                if (!next) return;
                setPreviewAsset((state) => (state ? { ...state, assetId: next.id } : state));
              }}>
                →
              </button>
            </div>
            <div className="viewer-toolbar" role="toolbar" aria-label="Accions de la foto">
              <button type="button" className="viewer-toolbar-btn viewer-toolbar-btn--primary" onClick={() => {
                setPreviewAsset(null);
                onEdit(previewCurrent);
              }}>
                Editar dades
              </button>
              <button type="button" className="viewer-toolbar-btn" onClick={() => {
                setPreviewAsset(null);
                onEditImage(previewCurrent);
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

