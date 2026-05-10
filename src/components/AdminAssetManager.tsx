"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import type { AppCollection } from "@/lib/collections";
import { AdminAssetPickerModal } from "@/components/AdminAssetPickerModal";
import { useAdminAssetStats, type SortState, type SortKey } from "@/components/admin/useAdminAssetStats";
import {
  COLOR_PRESETS,
  colorHueToPreset,
  fromDateInputValue,
  hexToHue,
  parseLocationText,
  toDateInputValue
} from "@/components/admin/adminAssetHelpers";

type AssetPickerTarget =
  | { kind: "collection"; id: string }
  | { kind: "tag"; tag: string }
  | { kind: "location"; key: string };

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

type DraftPatch = Partial<Pick<Asset, "title" | "takenAt" | "favorite" | "colorHue" | "location">>;
const CUSTOM_COLOR_STORAGE_KEY = "moments_admin_custom_colors_v1";
type TabId = "photos" | "collections" | "tags" | "locations" | "colors";

export function AdminAssetManager({ open, assets, collections, onClose, onEdit, onEditImage, onDelete, onQuickUpdate, onRefreshCollections }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("photos");
  const [sort, setSort] = useState<SortState[]>([{ key: "takenAt", dir: "desc" }]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
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
  const [newCollectionName, setNewCollectionName] = useState("");
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editingCollectionDraft, setEditingCollectionDraft] = useState("");
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(null);
  const [assetPickerTarget, setAssetPickerTarget] = useState<AssetPickerTarget | null>(null);
  const saveTimersRef = useRef<Record<string, number>>({});
  const allColorOptions = useMemo(() => [...COLOR_PRESETS, ...customColors], [customColors]);
  const { tagStats, locationStats, tagsToAssets, locationsToAssets, assetById, sorted } = useAdminAssetStats(assets, sort);

  const pickerAvailableAssets = useMemo(() => {
    if (!assetPickerTarget) return [];
    if (assetPickerTarget.kind === "collection") {
      const c = collections.find((x) => x.id === assetPickerTarget.id);
      if (!c) return [];
      const member = new Set(c.assetIds);
      return assets.filter((a) => !member.has(a.id));
    }
    if (assetPickerTarget.kind === "tag") {
      const tag = assetPickerTarget.tag;
      return assets.filter((asset) => !(asset.tags ?? []).map((t) => t.trim().toLowerCase()).includes(tag));
    }
    const key = assetPickerTarget.key;
    return assets.filter((asset) => {
      const ak = [asset.location?.city?.trim() ?? "", asset.location?.country?.trim() ?? ""].filter(Boolean).join(", ");
      return ak !== key;
    });
  }, [assetPickerTarget, assets, collections]);

  const pickerTitle = useMemo(() => {
    if (!assetPickerTarget) return "";
    if (assetPickerTarget.kind === "collection") {
      const name = collections.find((c) => c.id === assetPickerTarget.id)?.name ?? "";
      return `Afegir fotos a «${name}»`;
    }
    if (assetPickerTarget.kind === "tag") {
      return `Afegir fotos al tag «${assetPickerTarget.tag}»`;
    }
    return `Afegir fotos a la ubicació «${assetPickerTarget.key}»`;
  }, [assetPickerTarget, collections]);

  const pickerSubtitle = useMemo(() => {
    if (!assetPickerTarget) return "";
    if (assetPickerTarget.kind === "collection") {
      return "Cerca per nom o data (AAAA-MM-DD). Selecciona una o més fotos que encara no siguin en aquesta col·lecció.";
    }
    if (assetPickerTarget.kind === "tag") {
      return "Cerca per nom o data (AAAA-MM-DD). Selecciona fotos que encara no tinguin aquest tag.";
    }
    return "Cerca per nom o data (AAAA-MM-DD). Selecciona fotos que encara no tinguin aquesta ubicació (ciutat, país).";
  }, [assetPickerTarget]);

  const pickerEmptyEligible = useMemo(() => {
    if (!assetPickerTarget) return "";
    if (assets.length === 0) return "No hi ha fotos a la biblioteca.";
    if (assetPickerTarget.kind === "collection") return "Totes les fotos ja són en aquesta col·lecció.";
    if (assetPickerTarget.kind === "tag") return "Totes les fotos ja tenen aquest tag.";
    return "Totes les fotos ja tenen aquesta ubicació.";
  }, [assetPickerTarget, assets.length]);

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

  const getCollectionNames = (assetId: string) =>
    collections
      .filter((c) => c.assetIds.includes(assetId))
      .map((c) => c.name)
      .join(", ");

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

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (!res.ok) return;
    setNewCollectionName("");
    await onRefreshCollections?.();
  };

  const commitRenameCollection = async () => {
    if (!editingCollectionId) return;
    const name = editingCollectionDraft.trim();
    if (!name) return;
    const res = await fetch(`/api/collections/${editingCollectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (!res.ok) return;
    setEditingCollectionId(null);
    await onRefreshCollections?.();
  };

  const confirmDeleteCollection = async () => {
    if (!deleteCollectionId) return;
    const removedId = deleteCollectionId;
    const res = await fetch(`/api/collections/${removedId}`, { method: "DELETE" });
    if (!res.ok) return;
    setDeleteCollectionId(null);
    setOpenCollectionRows((prev) => {
      const next = { ...prev };
      delete next[removedId];
      return next;
    });
    if (assetPickerTarget?.kind === "collection" && assetPickerTarget.id === removedId) setAssetPickerTarget(null);
    await onRefreshCollections?.();
  };

  const handleAssetPickerConfirm = async (selectedIds: string[]) => {
    const target = assetPickerTarget;
    if (!target || selectedIds.length === 0) return;
    if (target.kind === "collection") {
      const colId = target.id;
      const results = await Promise.allSettled(
        selectedIds.map((assetId) =>
          fetch(`/api/collections/${colId}/assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId, include: true })
          }).then((r) => {
            if (!r.ok) throw new Error(String(r.status));
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        window.alert(`${failed} foto${failed === 1 ? "" : "s"} no s'han pogut afegir.`);
      }
      await onRefreshCollections?.();
      return;
    }
    if (target.kind === "tag") {
      const tag = target.tag;
      const results = await Promise.allSettled(
        selectedIds.map((id) => {
          const asset = assetById.get(id);
          if (!asset) return Promise.reject(new Error("missing"));
          return addTagToAsset(asset, tag);
        })
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        window.alert(`${failed} foto${failed === 1 ? "" : "s"} no s'han pogut actualitzar.`);
      }
      return;
    }
    const key = target.key;
    const [city = "", country = ""] = key.split(",").map((s) => s.trim());
    const results = await Promise.allSettled(
      selectedIds.map((id) => {
        const asset = assetById.get(id);
        if (!asset) return Promise.reject(new Error("missing"));
        return setLocationOnAsset(asset, city, country);
      })
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      window.alert(`${failed} foto${failed === 1 ? "" : "s"} no s'han pogut actualitzar.`);
    }
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
              <button type="button" role="tab" aria-selected={activeTab === "tags"} className={activeTab === "tags" ? "is-active" : ""} onClick={() => setActiveTab("tags")}>TAGS</button>
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
            <input type="checkbox" checked={showContent} onChange={(e) => setShowContent(e.target.checked)} />
            Contingut (descripció i TAGS)
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
                {showContent ? <th>TAGS</th> : null}
                <th className="admin-assets-col-collections">Col·leccions</th>
                <th className="admin-assets-col-delete" scope="col">
                  <span className="admin-assets-actions-head" aria-hidden>
                    <span className="admin-assets-actions-head-edit">✎</span>
                    <span className="admin-assets-actions-head-del">×</span>
                  </span>
                  <span className="sr-only">Editar informació i eliminar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleAssets.map((a) => {
                const thumb = (a.files.thumbUrl || a.files.previewUrl || a.files.originalUrl).trim();
                const locationText = `${draftById[a.id]?.location?.city ?? a.location?.city ?? ""}${(draftById[a.id]?.location?.country ?? a.location?.country) ? `, ${draftById[a.id]?.location?.country ?? a.location?.country ?? ""}` : ""}`;
                const saveState = savingById[a.id] ?? "idle";
                const isFavorite = draftById[a.id]?.favorite ?? a.favorite;
                return (
                <tr key={a.id}>
                  <td className="admin-assets-col-thumb">
                    <div className="admin-assets-thumb-wrap">
                      <button
                        type="button"
                        className={`admin-assets-thumb-btn${isFavorite ? " admin-assets-thumb-btn--favorite" : ""}`}
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
                  <td className="admin-assets-col-collections admin-assets-collections-cell">
                    {getCollectionNames(a.id) || "—"}
                  </td>
                  <td className="admin-assets-col-delete">
                    <div className="admin-assets-row-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost admin-assets-edit-info-btn"
                        onClick={() => onEdit(a)}
                        aria-label={`Editar informació: ${a.title}`}
                        title="Editar informació de la foto"
                      >
                        <svg className="admin-assets-edit-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
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
                        aria-label={`Eliminar ${a.title}`}
                      >
                        ×
                      </button>
                    </div>
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
          <div className="admin-tab-panel admin-tab-panel--collections">
            <div className="admin-collection-toolbar">
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Nom de la col·lecció"
                aria-label="Nom de la nova col·lecció"
                className="admin-collection-new-input"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateCollection();
                }}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleCreateCollection()}>
                Crear col·lecció
              </button>
            </div>
            <p className="modal-muted admin-collection-hint">
              Edita el nom, elimina la col·lecció o obre el selector per afegir fotos de la biblioteca que encara no hi siguin.
            </p>
            <table className="admin-stats-table">
              <thead>
                <tr>
                  <th>Col·lecció</th>
                  <th>Fotos</th>
                  <th className="admin-collection-actions-col">Accions</th>
                </tr>
              </thead>
              <tbody>
                {collections.map((collection) => {
                  const isEditing = editingCollectionId === collection.id;
                  const memberAssets = collection.assetIds.map((id) => assetById.get(id)).filter((x): x is Asset => Boolean(x));
                  return (
                    <Fragment key={collection.id}>
                      <tr>
                        <td>
                          {isEditing ? (
                            <div className="admin-collection-name-edit">
                              <input
                                type="text"
                                value={editingCollectionDraft}
                                onChange={(e) => setEditingCollectionDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void commitRenameCollection();
                                  if (e.key === "Escape") setEditingCollectionId(null);
                                }}
                                aria-label="Nou nom de la col·lecció"
                                autoFocus
                              />
                              <button type="button" className="btn btn-icon btn-sm" title="Desar" aria-label="Desar nom" onClick={() => void commitRenameCollection()}>
                                <span aria-hidden>✓</span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-icon btn-sm"
                                title="Cancel·lar"
                                aria-label="Cancel·lar"
                                onClick={() => setEditingCollectionId(null)}
                              >
                                <span aria-hidden>×</span>
                              </button>
                            </div>
                          ) : (
                            <div className="admin-collection-name-row">
                              <span className="admin-collection-name-text">{collection.name}</span>
                              <button
                                type="button"
                                className="btn btn-icon btn-sm"
                                title="Renombrar"
                                aria-label={`Renombrar ${collection.name}`}
                                onClick={() => {
                                  setEditingCollectionId(collection.id);
                                  setEditingCollectionDraft(collection.name);
                                }}
                              >
                                <span aria-hidden>✎</span>
                              </button>
                            </div>
                          )}
                        </td>
                        <td>{collection.assetIds.length}</td>
                        <td className="admin-collection-actions-cell">
                          <button type="button" className="btn btn-sm" onClick={() => toggleCollectionRow(collection.id)}>
                            {openCollectionRows[collection.id] ? "Amagar fotos" : "Mostrar fotos"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => setAssetPickerTarget({ kind: "collection", id: collection.id })}
                          >
                            Afegir fotos…
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm danger"
                            onClick={() => setDeleteCollectionId(collection.id)}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                      {openCollectionRows[collection.id] ? (
                        <tr key={`${collection.id}-assets`} className="admin-stats-expanded-row">
                          <td colSpan={3}>
                            <p className="admin-collection-members-label">Fotos d&apos;aquesta col·lecció (desmarca per treure-les)</p>
                            {memberAssets.length ? (
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
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openPreview(
                                            asset,
                                            collection.assetIds.map((id) => assetById.get(id)).filter((x): x is Asset => Boolean(x))
                                          )
                                        }
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element -- remote storage image */}
                                        <img src={thumb} alt={asset.title} referrerPolicy="no-referrer" />
                                      </button>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="modal-muted">Encara no hi ha fotos. Utilitza «Afegir fotos…».</p>
                            )}
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
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => setAssetPickerTarget({ kind: "tag", tag: row.value })}
                          >
                            Afegir fotos…
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
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => setAssetPickerTarget({ kind: "location", key: row.value })}
                          >
                            Afegir fotos…
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
                style={{ cursor: previewZoom === 2 ? "zoom-out" : undefined }}
                onClick={(e) => {
                  if (previewZoom === 2) {
                    e.stopPropagation();
                    setPreviewZoom(1);
                  }
                }}
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

      {deleteCollectionId ? (
        <div
          className="modal-overlay admin-sub-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminació de la col·lecció"
          onClick={() => setDeleteCollectionId(null)}
        >
          <div className="modal-content admin-sub-dialog" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <p>Vols eliminar aquesta col·lecció? Les fotos no s&apos;eliminen de la biblioteca.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setDeleteCollectionId(null)}>
                Cancel·lar
              </button>
              <button type="button" className="danger" onClick={() => void confirmDeleteCollection()}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {assetPickerTarget ? (
        <AdminAssetPickerModal
          key={
            assetPickerTarget.kind === "collection"
              ? `c-${assetPickerTarget.id}`
              : assetPickerTarget.kind === "tag"
                ? `t-${assetPickerTarget.tag}`
                : `l-${assetPickerTarget.key}`
          }
          open
          title={pickerTitle}
          subtitle={pickerSubtitle}
          availableAssets={pickerAvailableAssets}
          emptyWhenNoEligible={pickerEmptyEligible}
          onClose={() => setAssetPickerTarget(null)}
          onConfirm={handleAssetPickerConfirm}
        />
      ) : null}
    </div>
  );
}

