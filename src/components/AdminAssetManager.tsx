"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Asset } from "@/lib/types";
import type { LibraryGridPreferencesBinder } from "@/lib/grid-library";
import type { AppCollection } from "@/lib/collections";
import { formatMusicDuration, formatMusicSize, type CollectionMusicTrack } from "@/lib/collection-music";
import { AdminAssetPickerModal } from "@/components/AdminAssetPickerModal";
import { LibraryGridPreferencesPanel } from "@/components/LibraryGridPreferencesPanel";
import { ViewerFavoriteButton } from "@/components/ViewerFavoriteButton";
import { useAdminAssetStats, type SortState, type SortKey } from "@/components/admin/useAdminAssetStats";
import { fromDateInputValue, parseLocationText, toDateInputValue } from "@/components/admin/adminAssetHelpers";
import { AdminColorsPanel } from "@/components/admin/AdminColorsPanel";
import { ColorSelect } from "@/components/admin/ColorSelect";
import { buildColorOptionsFromPalette, type StoredPalette } from "@/lib/admin-color-palette";
import { hexEquals, normalizeHex, resolveAssetColorHex } from "@/lib/color-utils";
import {
  DEFAULT_PHOTO_COLUMNS,
  DEFAULT_TAB_ORDER,
  normalizePhotoColumnOrder,
  normalizeTabOrder,
  photoColumnsForDisplay,
  reorderPhotoColumns,
  reorderTabs,
  STORAGE_PHOTO_COLS,
  STORAGE_TAB_ORDER,
  loadStoredTabOrder,
  type AdminTabId,
  type PhotoColumnKey
} from "@/components/admin/adminDnD";

const TAB_LABELS: Record<AdminTabId, string> = {
  photos: "Fotos",
  libraryGrid: "Graella",
  guest: "Convidat",
  collections: "Col·leccions",
  tags: "TAGS",
  locations: "Ubicacions",
  colors: "Colors"
};

/** Referència estable: amb el modal tancat no recalculem estadístiques sobre tota la biblioteca. */
const EMPTY_STATS_ASSETS: Asset[] = [];

const PHOTO_COL_CLASS: Record<PhotoColumnKey, string> = {
  thumb: "admin-assets-col-thumb",
  title: "admin-assets-col-title",
  takenAt: "admin-assets-col-takenAt",
  color: "admin-assets-col-color",
  location: "admin-assets-col-location",
  favorite: "admin-assets-col-favorite",
  hiddenGuest: "admin-assets-col-hiddenGuest",
  desc: "admin-assets-col-desc",
  tags: "admin-assets-col-tags",
  collections: "admin-assets-col-collections",
  actions: "admin-assets-col-delete"
};

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
  libraryGridPrefs: LibraryGridPreferencesBinder;
  colorPalette: StoredPalette;
  onColorPaletteChange: (palette: StoredPalette) => void;
};

type DraftPatch = Partial<Pick<Asset, "title" | "takenAt" | "favorite" | "colorHex" | "location" | "hiddenFromGuests">>;

function readAudioDurationFromUrl(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      audio.removeAttribute("src");
      audio.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), 5000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done(Number.isFinite(audio.duration) ? audio.duration : null);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    audio.src = url;
  });
}

async function readAudioDurationFromFile(file: File): Promise<number | null> {
  const url = URL.createObjectURL(file);
  try {
    return await readAudioDurationFromUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
type GuestProfileCfg = {
  guestAccessEnabled: boolean;
  guestSlug: string | null;
  showInGuestDirectory: boolean;
  guestDisplayName: string;
  guestUrl: string | null;
};

export function AdminAssetManager({
  open,
  assets,
  collections,
  onClose,
  onEdit,
  onEditImage,
  onDelete,
  onQuickUpdate,
  onRefreshCollections,
  libraryGridPrefs,
  colorPalette,
  onColorPaletteChange
}: Props) {
  const [activeTab, setActiveTab] = useState<AdminTabId>("photos");
  const [sort, setSort] = useState<SortState[]>([{ key: "takenAt", dir: "desc" }]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const [showContent, setShowContent] = useState(true);
  const [savingById, setSavingById] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [draftById, setDraftById] = useState<Record<string, DraftPatch>>({});
  const [previewAsset, setPreviewAsset] = useState<{ assetId: string; sourceIds: string[] } | null>(null);
  const [previewZoom, setPreviewZoom] = useState<1 | 2>(1);
  const [previewFavBusy, setPreviewFavBusy] = useState(false);
  const [openTagRows, setOpenTagRows] = useState<Record<string, boolean>>({});
  const [openLocationRows, setOpenLocationRows] = useState<Record<string, boolean>>({});
  const [openCollectionRows, setOpenCollectionRows] = useState<Record<string, boolean>>({});
  const [editingTagName, setEditingTagName] = useState<Record<string, string>>({});
  const [editingLocationName, setEditingLocationName] = useState<Record<string, string>>({});
  const [newCollectionName, setNewCollectionName] = useState("");
  const [guestCfg, setGuestCfg] = useState<GuestProfileCfg | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestSaving, setGuestSaving] = useState(false);
  const [guestErr, setGuestErr] = useState<string | null>(null);
  const [guestSlugDraft, setGuestSlugDraft] = useState("");
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editingCollectionDraft, setEditingCollectionDraft] = useState("");
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(null);
  const [musicTracks, setMusicTracks] = useState<CollectionMusicTrack[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [musicUploadTitle, setMusicUploadTitle] = useState("");
  const [musicLinkTitle, setMusicLinkTitle] = useState("");
  const [musicLinkUrl, setMusicLinkUrl] = useState("");
  const [assetPickerTarget, setAssetPickerTarget] = useState<AssetPickerTarget | null>(null);
  const [tabOrder, setTabOrder] = useState<AdminTabId[]>(() => loadStoredTabOrder());
  const [photoColumnOrder, setPhotoColumnOrder] = useState<PhotoColumnKey[]>(() => {
    if (typeof window === "undefined") return [...DEFAULT_PHOTO_COLUMNS];
    try {
      const raw = localStorage.getItem(STORAGE_PHOTO_COLS);
      if (raw) return normalizePhotoColumnOrder(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return [...DEFAULT_PHOTO_COLUMNS];
  });
  const saveTimersRef = useRef<Record<string, number>>({});
  const musicFileInputRef = useRef<HTMLInputElement>(null);
  const musicPreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [collectionsSubTab, setCollectionsSubTab] = useState<"apartats" | "cancions">("apartats");
  const [musicPreviewTrackId, setMusicPreviewTrackId] = useState<string | null>(null);
  const allColorOptions = useMemo(() => buildColorOptionsFromPalette(colorPalette), [colorPalette]);

  const stopMusicPreview = useCallback(() => {
    const audio = musicPreviewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setMusicPreviewTrackId(null);
  }, []);

  const toggleMusicPreview = useCallback(
    (track: CollectionMusicTrack) => {
      const url = track.url.trim();
      if (!url) return;
      let audio = musicPreviewAudioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.addEventListener("ended", () => setMusicPreviewTrackId(null));
        musicPreviewAudioRef.current = audio;
      }
      if (musicPreviewTrackId === track.id && !audio.paused) {
        audio.pause();
        setMusicPreviewTrackId(null);
        return;
      }
      audio.src = url;
      setMusicPreviewTrackId(track.id);
      void audio.play().catch(() => setMusicPreviewTrackId(null));
    },
    [musicPreviewTrackId]
  );

  const clearPhotosWithHex = useCallback(
    async (hex: string) => {
      const target = normalizeHex(hex);
      if (!target) return;
      const affected = assets.filter((a) => {
        const h = resolveAssetColorHex(a);
        return h !== null && hexEquals(h, target);
      });
      for (const a of affected) {
        await onQuickUpdate(a, { colorHex: null });
      }
    },
    [assets, onQuickUpdate]
  );

  const migratePhotosHex = useCallback(
    async (fromHex: string, toHex: string) => {
      const from = normalizeHex(fromHex);
      const to = normalizeHex(toHex);
      if (!from || !to || hexEquals(from, to)) return;
      const affected = assets.filter((a) => {
        const h = resolveAssetColorHex(a);
        return h !== null && hexEquals(h, from);
      });
      for (const a of affected) {
        await onQuickUpdate(a, { colorHex: to });
      }
    },
    [assets, onQuickUpdate]
  );
  const statsAssets = open ? assets : EMPTY_STATS_ASSETS;
  const { tagStats, locationStats, tagsToAssets, locationsToAssets, assetById, sorted } = useAdminAssetStats(statsAssets, sort);

  const refreshMusicTracks = useCallback(async () => {
    setMusicLoading(true);
    setMusicError(null);
    try {
      const res = await fetch("/api/collection-music", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { tracks?: CollectionMusicTrack[]; error?: string };
      if (!res.ok) {
        setMusicError(body.error ?? "No s'ha pogut carregar la música.");
        return;
      }
      setMusicTracks(body.tracks ?? []);
    } finally {
      setMusicLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || activeTab !== "collections") return;
    void refreshMusicTracks();
  }, [activeTab, open, refreshMusicTracks]);

  useEffect(() => {
    if (!open || activeTab !== "collections") stopMusicPreview();
  }, [activeTab, collectionsSubTab, open, stopMusicPreview]);

  useEffect(() => () => stopMusicPreview(), [stopMusicPreview]);

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

  const visiblePhotoColumns = useMemo(
    () => photoColumnsForDisplay(photoColumnOrder, showContent),
    [photoColumnOrder, showContent]
  );

  const onPhotoColDragStart = useCallback((col: PhotoColumnKey) => (e: React.DragEvent) => {
    e.dataTransfer.setData("photo-col", col);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onPhotoColDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onPhotoColDrop = useCallback((dropCol: PhotoColumnKey) => {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const from = e.dataTransfer.getData("photo-col") as PhotoColumnKey;
      if (from && from !== dropCol) {
        setPhotoColumnOrder((prev) => reorderPhotoColumns(prev, from, dropCol));
      }
    };
  }, []);

  const onTabDragStart = useCallback((tabId: AdminTabId) => (e: React.DragEvent) => {
    e.dataTransfer.setData("admin-tab", tabId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onTabDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onTabDrop = useCallback((dropTab: AdminTabId) => {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const from = e.dataTransfer.getData("admin-tab") as AdminTabId;
      if (from && from !== dropTab) {
        setTabOrder((prev) => reorderTabs(prev, from, dropTab));
      }
    };
  }, []);

  useEffect(() => {
    if (!open || activeTab !== "guest") return;
    setGuestLoading(true);
    setGuestErr(null);
    void (async () => {
      try {
        const res = await fetch("/api/profile/guest", { cache: "no-store" });
        const body = (await res.json()) as GuestProfileCfg & { error?: string };
        if (!res.ok) {
          setGuestErr(body.error ?? "No s’han pogut carregar les opcions.");
          setGuestCfg(null);
          return;
        }
        setGuestCfg({
          guestAccessEnabled: body.guestAccessEnabled,
          guestSlug: body.guestSlug,
          showInGuestDirectory: body.showInGuestDirectory,
          guestDisplayName: body.guestDisplayName,
          guestUrl: body.guestUrl
        });
        setGuestSlugDraft(body.guestSlug?.trim() ?? "");
      } catch {
        setGuestErr("Error de connexió.");
        setGuestCfg(null);
      } finally {
        setGuestLoading(false);
      }
    })();
  }, [open, activeTab]);

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
      localStorage.setItem(STORAGE_TAB_ORDER, JSON.stringify(tabOrder));
    } catch {
      /* ignore */
    }
  }, [tabOrder]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_PHOTO_COLS, JSON.stringify(photoColumnOrder));
    } catch {
      /* ignore */
    }
  }, [photoColumnOrder]);

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

  const handleUploadMusicFile = async (file: File | undefined) => {
    if (!file) return;
    setMusicBusy(true);
    setMusicError(null);
    try {
      const duration = await readAudioDurationFromFile(file);
      const form = new FormData();
      form.set("source", "uploaded");
      form.set("file", file);
      form.set("title", musicUploadTitle.trim() || file.name.replace(/\.[^.]+$/, ""));
      if (duration) form.set("durationSeconds", String(Math.round(duration)));
      const res = await fetch("/api/collection-music", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMusicError(body.error ?? "No s'ha pogut pujar l'MP3.");
        return;
      }
      setMusicUploadTitle("");
      if (musicFileInputRef.current) musicFileInputRef.current.value = "";
      await refreshMusicTracks();
    } finally {
      setMusicBusy(false);
    }
  };

  const handleAddLinkedMusic = async () => {
    const url = musicLinkUrl.trim();
    if (!url) return;
    setMusicBusy(true);
    setMusicError(null);
    try {
      const duration = await readAudioDurationFromUrl(url);
      const form = new FormData();
      form.set("source", "linked");
      form.set("url", url);
      form.set("title", musicLinkTitle.trim() || url);
      if (duration) form.set("durationSeconds", String(Math.round(duration)));
      const res = await fetch("/api/collection-music", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMusicError(body.error ?? "No s'ha pogut vincular la música.");
        return;
      }
      setMusicLinkTitle("");
      setMusicLinkUrl("");
      await refreshMusicTracks();
    } finally {
      setMusicBusy(false);
    }
  };

  const assignMusicToCollection = async (collectionId: string, musicTrackId: string | null) => {
    const res = await fetch(`/api/collections/${collectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ musicTrackId })
    });
    if (!res.ok) return;
    await onRefreshCollections?.();
  };

  const deleteMusicTrack = async (track: CollectionMusicTrack) => {
    const ok = window.confirm(`Vols eliminar «${track.title}» de la biblioteca de música?`);
    if (!ok) return;
    setMusicBusy(true);
    setMusicError(null);
    try {
      const res = await fetch(`/api/collection-music/${track.id}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMusicError(body.error ?? "No s'ha pogut eliminar la pista.");
        return;
      }
      await refreshMusicTracks();
      if (musicPreviewTrackId === track.id) stopMusicPreview();
      await onRefreshCollections?.();
    } finally {
      setMusicBusy(false);
    }
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

  type PhotoRowCtx = {
    thumb: string;
    locationText: string;
    saveState: "idle" | "saving" | "saved" | "error";
    isFavorite: boolean;
    hideGuest: boolean;
  };

  const renderPhotoHeaderCell = (col: PhotoColumnKey) => {
    const grip = (
      <span
        className="admin-drag-handle"
        draggable
        onDragStart={onPhotoColDragStart(col)}
        onClick={(e) => e.stopPropagation()}
        title="Arrossega per reordenar columnes"
        aria-hidden
      >
        ⋮
      </span>
    );
    let main: ReactNode;
    switch (col) {
      case "thumb":
        main = <span>Mini</span>;
        break;
      case "title":
        main = (
          <button type="button" onClick={(e) => toggleSort("title", e.shiftKey)}>
            Nom
          </button>
        );
        break;
      case "takenAt":
        main = (
          <button type="button" onClick={(e) => toggleSort("takenAt", e.shiftKey)}>
            Data
          </button>
        );
        break;
      case "color":
        main = (
          <button type="button" onClick={(e) => toggleSort("color", e.shiftKey)}>
            Color
          </button>
        );
        break;
      case "location":
        main = (
          <button type="button" onClick={(e) => toggleSort("location", e.shiftKey)}>
            Ubicació
          </button>
        );
        break;
      case "favorite":
        main = (
          <button type="button" onClick={(e) => toggleSort("favorite", e.shiftKey)}>
            Preferit
          </button>
        );
        break;
      case "hiddenGuest":
        main = <span>Conv.</span>;
        break;
      case "desc":
        main = <span>📝</span>;
        break;
      case "tags":
        main = <span>TAGS</span>;
        break;
      case "collections":
        main = <span>Col·leccions</span>;
        break;
      case "actions":
        main = (
          <>
            <span className="admin-assets-actions-head" aria-hidden>
              <span className="admin-assets-actions-head-edit">✎</span>
              <span className="admin-assets-actions-head-del">×</span>
            </span>
            <span className="sr-only">Editar informació i eliminar</span>
          </>
        );
        break;
      default:
        main = null;
    }
    const thTitle =
      col === "hiddenGuest" ? "Ocultar als convidats" : col === "desc" ? "Descripció" : undefined;
    return (
      <th
        key={col}
        className={PHOTO_COL_CLASS[col]}
        scope="col"
        title={thTitle}
        onDragOver={onPhotoColDragOver}
        onDrop={onPhotoColDrop(col)}
      >
        <div className="admin-assets-th-inner">
          {grip}
          {main}
        </div>
      </th>
    );
  };

  const renderPhotoBodyCell = (a: Asset, col: PhotoColumnKey, ctx: PhotoRowCtx) => {
    switch (col) {
      case "thumb":
        return (
          <td key={col} className={PHOTO_COL_CLASS.thumb}>
            <div className="admin-assets-thumb-wrap">
              <button
                type="button"
                className={`admin-assets-thumb-btn${ctx.isFavorite ? " admin-assets-thumb-btn--favorite" : ""}`}
                onClick={() => {
                  if (!ctx.thumb) return;
                  openPreview(a, visibleAssets);
                }}
                aria-label={`Ampliar ${a.title}`}
              >
                {ctx.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote storage image
                  <img src={ctx.thumb} alt={a.title} className="admin-assets-thumb" referrerPolicy="no-referrer" />
                ) : (
                  <span className="admin-assets-thumb admin-assets-thumb--empty">·</span>
                )}
              </button>
              {ctx.thumb ? (
                <div className="admin-assets-hover-preview" aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote storage image */}
                  <img src={ctx.thumb} alt="" referrerPolicy="no-referrer" />
                </div>
              ) : null}
            </div>
          </td>
        );
      case "title":
        return (
          <td key={col} className={PHOTO_COL_CLASS.title}>
            <div className="admin-assets-title-cell">
              <input
                type="text"
                value={draftById[a.id]?.title ?? a.title}
                onChange={(e) => updateDraft(a, { title: e.target.value })}
              />
              <span className={`admin-assets-save admin-assets-save--${ctx.saveState}`}>
                {ctx.saveState === "saving"
                  ? "desant..."
                  : ctx.saveState === "saved"
                    ? "desat"
                    : ctx.saveState === "error"
                      ? "error"
                      : ""}
              </span>
            </div>
          </td>
        );
      case "takenAt":
        return (
          <td key={col} className={PHOTO_COL_CLASS.takenAt}>
            <input
              type="date"
              value={toDateInputValue(draftById[a.id]?.takenAt ?? a.takenAt)}
              onChange={(e) => updateDraft(a, { takenAt: fromDateInputValue(e.target.value) })}
            />
          </td>
        );
      case "color":
        return (
          <td key={col} className={PHOTO_COL_CLASS.color}>
            <ColorSelect
              value={draftById[a.id]?.colorHex ?? resolveAssetColorHex(a)}
              options={allColorOptions}
              onChange={(hex) => updateDraft(a, { colorHex: hex })}
            />
          </td>
        );
      case "location":
        return (
          <td key={col} className={PHOTO_COL_CLASS.location}>
            <input
              type="text"
              value={ctx.locationText}
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
        );
      case "favorite":
        return (
          <td key={col} className={PHOTO_COL_CLASS.favorite}>
            <label className="admin-assets-checkbox-wrap" aria-label={`Favorito ${a.title}`}>
              <input
                type="checkbox"
                checked={draftById[a.id]?.favorite ?? a.favorite}
                onChange={(e) => updateDraft(a, { favorite: e.target.checked })}
              />
            </label>
          </td>
        );
      case "hiddenGuest":
        return (
          <td key={col} className={PHOTO_COL_CLASS.hiddenGuest}>
            <label className="admin-assets-checkbox-wrap" aria-label={`Ocultar als convidats: ${a.title}`} title="Ocultar als convidats">
              <input
                type="checkbox"
                checked={ctx.hideGuest}
                onChange={(e) => updateDraft(a, { hiddenFromGuests: e.target.checked })}
              />
            </label>
          </td>
        );
      case "desc":
        return (
          <td key={col} className={PHOTO_COL_CLASS.desc}>
            {a.description?.trim() ? "●" : ""}
          </td>
        );
      case "tags":
        return (
          <td key={col} className={PHOTO_COL_CLASS.tags}>
            {a.tags?.length ? "●" : ""}
          </td>
        );
      case "collections":
        return (
          <td key={col} className={`${PHOTO_COL_CLASS.collections} admin-assets-collections-cell`}>
            {getCollectionNames(a.id) || "—"}
          </td>
        );
      case "actions":
        return (
          <td key={col} className={PHOTO_COL_CLASS.actions}>
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
        );
      default:
        return null;
    }
  };

  return (
    <div className="modal-overlay modal-overlay--front admin-assets-overlay" role="dialog" aria-modal="true" aria-label="Configuració de la biblioteca" onClick={onClose}>
      <div className="modal-content admin-assets-modal admin-assets-modal--fullscreen" onClick={(e) => e.stopPropagation()}>
        <header className="admin-assets-head">
          <h2>Configuració</h2>
          <div className="admin-assets-head-actions">
            <div className="admin-tabs" role="tablist" aria-label="Pestanyes de configuració">
              {tabOrder.map((tabId) => (
                <div key={tabId} className="admin-tab-item" onDragOver={onTabDragOver} onDrop={onTabDrop(tabId)}>
                  <span
                    className="admin-tab-grip"
                    draggable
                    onDragStart={onTabDragStart(tabId)}
                    title="Arrossega per reordenar pestanyes"
                    aria-hidden
                  >
                    ⋮
                  </span>
                  <button type="button" role="tab" aria-selected={activeTab === tabId} className={activeTab === tabId ? "is-active" : ""} onClick={() => setActiveTab(tabId)}>
                    {TAB_LABELS[tabId]}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Tancar">
            ×
          </button>
        </header>

        <div className="admin-assets-body">
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
              <tr>{visiblePhotoColumns.map((col) => renderPhotoHeaderCell(col))}</tr>
            </thead>
            <tbody>
              {visibleAssets.map((a) => {
                const thumb = (a.files.thumbUrl || a.files.previewUrl || a.files.originalUrl).trim();
                const locationText = `${draftById[a.id]?.location?.city ?? a.location?.city ?? ""}${(draftById[a.id]?.location?.country ?? a.location?.country) ? `, ${draftById[a.id]?.location?.country ?? a.location?.country ?? ""}` : ""}`;
                const saveState = savingById[a.id] ?? "idle";
                const isFavorite = draftById[a.id]?.favorite ?? a.favorite;
                const hideGuest = draftById[a.id]?.hiddenFromGuests ?? a.hiddenFromGuests ?? false;
                const ctx: PhotoRowCtx = { thumb, locationText, saveState, isFavorite, hideGuest };
                return (
                  <tr key={a.id}>{visiblePhotoColumns.map((col) => renderPhotoBodyCell(a, col, ctx))}</tr>
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

        {activeTab === "guest" ? (
          <div className="guest-settings-panel">
            {guestLoading ? <p className="modal-muted">Carregant…</p> : null}
            {guestErr ? (
              <p className="modal-error" role="alert">
                {guestErr}
              </p>
            ) : null}
            {!guestLoading && guestCfg ? (
              <>
                <fieldset>
                  <legend>Compartició</legend>
                  <label className="guest-settings-row">
                    <input
                      type="checkbox"
                      checked={guestCfg.guestAccessEnabled}
                      disabled={guestSaving}
                      onChange={(e) =>
                        setGuestCfg((g) =>
                          g ? { ...g, guestAccessEnabled: e.target.checked } : g
                        )
                      }
                    />
                    <span>Permetre accés com a convidat (enllaç públic de només lectura)</span>
                  </label>
                  <label className="guest-settings-row">
                    <input
                      type="checkbox"
                      checked={guestCfg.showInGuestDirectory}
                      disabled={guestSaving || !guestCfg.guestAccessEnabled}
                      onChange={(e) =>
                        setGuestCfg((g) =>
                          g ? { ...g, showInGuestDirectory: e.target.checked } : g
                        )
                      }
                    />
                    <span>Apareixer al directori de convidats (nom sense correu)</span>
                  </label>
                  <label className="guest-settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <span>Nom visible al directori</span>
                    <input
                      type="text"
                      value={guestCfg.guestDisplayName}
                      disabled={guestSaving}
                      placeholder="Per exemple: Família Garcia"
                      onChange={(e) =>
                        setGuestCfg((g) => (g ? { ...g, guestDisplayName: e.target.value } : g))
                      }
                    />
                  </label>
                  <label className="guest-settings-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <span>Identificador d’enllaç (slug)</span>
                    <input
                      type="text"
                      value={guestSlugDraft}
                      disabled={guestSaving}
                      placeholder="minúscules, números i guions"
                      onChange={(e) => setGuestSlugDraft(e.target.value.toLowerCase())}
                    />
                  </label>
                </fieldset>
                <div className="guest-settings-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={guestSaving}
                    onClick={() =>
                      void (async () => {
                        if (!guestCfg) return;
                        setGuestSaving(true);
                        setGuestErr(null);
                        try {
                          const res = await fetch("/api/profile/guest", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              guest_access_enabled: guestCfg.guestAccessEnabled,
                              show_in_guest_directory: guestCfg.showInGuestDirectory,
                              guest_display_name: guestCfg.guestDisplayName.trim() || null,
                              guest_slug: guestSlugDraft.trim() || null
                            })
                          });
                          const body = (await res.json()) as GuestProfileCfg & { error?: string };
                          if (!res.ok) {
                            setGuestErr(body.error ?? "Error en desar.");
                            return;
                          }
                          setGuestCfg({
                            guestAccessEnabled: body.guestAccessEnabled,
                            guestSlug: body.guestSlug,
                            showInGuestDirectory: body.showInGuestDirectory,
                            guestDisplayName: body.guestDisplayName,
                            guestUrl: body.guestUrl
                          });
                          setGuestSlugDraft(body.guestSlug?.trim() ?? "");
                        } catch {
                          setGuestErr("Error en desar.");
                        } finally {
                          setGuestSaving(false);
                        }
                      })()
                    }
                  >
                    {guestSaving ? "Desant…" : "Desar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={guestSaving || !guestCfg.guestAccessEnabled}
                    onClick={() =>
                      void (async () => {
                        setGuestSaving(true);
                        setGuestErr(null);
                        try {
                          const res = await fetch("/api/profile/guest", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ regenerate_guest_slug: true })
                          });
                          const body = (await res.json()) as GuestProfileCfg & { error?: string };
                          if (!res.ok) {
                            setGuestErr(body.error ?? "Error.");
                            return;
                          }
                          setGuestCfg({
                            guestAccessEnabled: body.guestAccessEnabled,
                            guestSlug: body.guestSlug,
                            showInGuestDirectory: body.showInGuestDirectory,
                            guestDisplayName: body.guestDisplayName,
                            guestUrl: body.guestUrl
                          });
                          setGuestSlugDraft(body.guestSlug?.trim() ?? "");
                        } catch {
                          setGuestErr("Error.");
                        } finally {
                          setGuestSaving(false);
                        }
                      })()
                    }
                  >
                    Nou enllaç aleatori
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={guestSaving || !guestCfg.guestUrl}
                    onClick={() => {
                      if (guestCfg?.guestUrl) void navigator.clipboard.writeText(guestCfg.guestUrl);
                    }}
                  >
                    Copiar URL
                  </button>
                </div>
                {guestCfg.guestUrl ? (
                  <p className="modal-muted" style={{ marginTop: 12, wordBreak: "break-all", fontSize: 12 }}>
                    {guestCfg.guestUrl}
                  </p>
                ) : (
                  <p className="modal-muted" style={{ marginTop: 12, fontSize: 12 }}>
                    Activa l’accés i desar per generar un enllaç.
                  </p>
                )}
              </>
            ) : null}
          </div>
        ) : null}

        {activeTab === "collections" ? (
          <div className="admin-tab-panel admin-tab-panel--collections">
            <div className="admin-collections-subtabs" role="tablist" aria-label="Seccions de col·leccions">
              <button
                type="button"
                role="tab"
                aria-selected={collectionsSubTab === "apartats"}
                className={collectionsSubTab === "apartats" ? "is-active" : undefined}
                onClick={() => setCollectionsSubTab("apartats")}
              >
                Apartats
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={collectionsSubTab === "cancions"}
                className={collectionsSubTab === "cancions" ? "is-active" : undefined}
                onClick={() => setCollectionsSubTab("cancions")}
              >
                Cançons
              </button>
            </div>
            {collectionsSubTab === "apartats" ? (
            <div className="admin-collections-panel admin-collections-panel--apartats">
            <div className="admin-collections-layout admin-collections-layout--apartats">
              <div className="admin-collections-main">
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
                  Edita el nom, assigna una cançó, elimina la col·lecció o obre el selector per afegir fotos. Les cançons es gestionen a la sub-pestanya «Cançons».
                </p>
                <table className="admin-stats-table">
                  <thead>
                    <tr>
                      <th>Col·lecció</th>
                      <th>Fotos</th>
                      <th>Música</th>
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
                                  {collection.musicTrack ? <span className="admin-collection-music-pill">♪ {collection.musicTrack.title}</span> : null}
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
                            <td>
                              <select
                                className="admin-collection-music-select"
                                value={collection.musicTrackId ?? ""}
                                onChange={(e) => void assignMusicToCollection(collection.id, e.target.value || null)}
                              >
                                <option value="">Sense música</option>
                                {musicTracks.map((track) => (
                                  <option key={track.id} value={track.id}>
                                    {track.title}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="admin-collection-actions-cell">
                              <button
                                type="button"
                                className={`btn btn-icon btn-sm admin-collection-icon-btn${openCollectionRows[collection.id] ? " is-active" : ""}`}
                                title={openCollectionRows[collection.id] ? "Amagar fotos" : "Mostrar fotos"}
                                aria-label={openCollectionRows[collection.id] ? `Amagar fotos de ${collection.name}` : `Mostrar fotos de ${collection.name}`}
                                aria-pressed={!!openCollectionRows[collection.id]}
                                onClick={() => toggleCollectionRow(collection.id)}
                              >
                                <span className="admin-collection-icon admin-collection-icon-grid" aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="btn btn-icon btn-sm btn-primary admin-collection-icon-btn"
                                title="Afegir fotos"
                                aria-label={`Afegir fotos a ${collection.name}`}
                                onClick={() => setAssetPickerTarget({ kind: "collection", id: collection.id })}
                              >
                                <span className="admin-collection-icon admin-collection-icon-add" aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="btn btn-icon btn-sm danger admin-collection-icon-btn"
                                title="Eliminar"
                                aria-label={`Eliminar la col·lecció ${collection.name}`}
                                onClick={() => setDeleteCollectionId(collection.id)}
                              >
                                <span className="admin-collection-icon admin-collection-icon-delete" aria-hidden />
                              </button>
                            </td>
                          </tr>
                          {openCollectionRows[collection.id] ? (
                            <tr key={`${collection.id}-assets`} className="admin-stats-expanded-row">
                              <td colSpan={4}>
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
            </div>
            </div>
            ) : (
              <div className="admin-collections-panel admin-collections-panel--cancions" aria-label="Cançons per a col·leccions">
                <p className="modal-muted admin-collection-hint">
                  Puja MP3 a Supabase o vincula un àudio directe. Després assigna cada cançó a un apartat des de la sub-pestanya «Apartats».
                </p>
                <div className="admin-collection-music-uploads">
                <div className="admin-collection-music-card">
                  <strong>Pujar MP3</strong>
                  <input
                    type="text"
                    value={musicUploadTitle}
                    onChange={(e) => setMusicUploadTitle(e.target.value)}
                    placeholder="Títol opcional"
                    aria-label="Títol de l'MP3"
                  />
                  <input
                    ref={musicFileInputRef}
                    type="file"
                    accept="audio/mpeg,audio/mp3,.mp3"
                    onChange={(e) => void handleUploadMusicFile(e.target.files?.[0])}
                    disabled={musicBusy}
                  />
                </div>
                <div className="admin-collection-music-card">
                  <strong>Vincular URL</strong>
                  <input
                    type="text"
                    value={musicLinkTitle}
                    onChange={(e) => setMusicLinkTitle(e.target.value)}
                    placeholder="Nom de la cançó"
                    aria-label="Nom de la cançó vinculada"
                  />
                  <input
                    type="url"
                    value={musicLinkUrl}
                    onChange={(e) => setMusicLinkUrl(e.target.value)}
                    placeholder="https://.../canço.mp3"
                    aria-label="URL directa d'àudio"
                  />
                  <button type="button" className="btn btn-sm" disabled={musicBusy || !musicLinkUrl.trim()} onClick={() => void handleAddLinkedMusic()}>
                    Afegir enllaç
                  </button>
                </div>
                </div>
                {musicError ? <p className="modal-error">{musicError}</p> : null}
                <div className="admin-collection-music-list-head">
                  <strong>Llista de cançons</strong>
                  <button type="button" className="btn btn-sm" disabled={musicLoading} onClick={() => void refreshMusicTracks()}>
                    Actualitzar
                  </button>
                </div>
                <table className="admin-stats-table admin-collection-music-table">
                  <thead>
                    <tr>
                      <th className="admin-collection-music-play-col" aria-label="Reproduir" />
                      <th>Títol</th>
                      <th>Origen</th>
                      <th>Durada</th>
                      <th>Mida</th>
                      <th className="admin-collection-actions-col">Accions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {musicLoading ? (
                      <tr>
                        <td colSpan={6} className="modal-muted">
                          Carregant música…
                        </td>
                      </tr>
                    ) : null}
                    {!musicLoading && musicTracks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="modal-muted">
                          Encara no hi ha cançons.
                        </td>
                      </tr>
                    ) : null}
                    {musicTracks.map((track) => {
                      const isPlaying = musicPreviewTrackId === track.id;
                      return (
                        <tr key={track.id}>
                          <td className="admin-collection-music-play-cell">
                            <button
                              type="button"
                              className={`viewer-toolbar-btn viewer-toolbar-btn--icon admin-collection-music-play-btn${isPlaying ? " is-playing" : ""}`}
                              aria-label={isPlaying ? `Pausar ${track.title}` : `Reproduir ${track.title}`}
                              title={isPlaying ? "Pausar" : "Reproduir"}
                              disabled={!track.url.trim()}
                              onClick={() => toggleMusicPreview(track)}
                            >
                              <span className={`viewer-icon ${isPlaying ? "viewer-icon-pause" : "viewer-icon-play"}`} aria-hidden />
                            </button>
                          </td>
                          <td>
                            <strong>{track.title}</strong>
                          </td>
                          <td>{track.source === "uploaded" ? "MP3 pujat" : "Enllaç extern"}</td>
                          <td>{formatMusicDuration(track.durationSeconds)}</td>
                          <td>{track.source === "uploaded" ? formatMusicSize(track.sizeBytes) : "—"}</td>
                          <td className="admin-collection-actions-cell">
                            <button
                              type="button"
                              className="btn btn-icon btn-sm btn-icon--danger"
                              aria-label={`Eliminar ${track.title}`}
                              disabled={musicBusy}
                              onClick={() => void deleteMusicTrack(track)}
                            >
                              <span aria-hidden>×</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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

        {activeTab === "libraryGrid" ? (
          <div className="admin-tab-panel">
            <LibraryGridPreferencesPanel variant="settings" {...libraryGridPrefs} />
          </div>
        ) : null}

        {activeTab === "colors" ? (
          <div className="admin-tab-panel admin-tab-panel--colors">
            <AdminColorsPanel
              assets={assets}
              palette={colorPalette}
              onPaletteChange={onColorPaletteChange}
              onClearPhotosWithHex={clearPhotosWithHex}
              onMigratePhotosHex={migratePhotosHex}
            />
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
              <ViewerFavoriteButton
                favorite={!!previewCurrent.favorite}
                busy={previewFavBusy}
                onClick={() => {
                  const next = !previewCurrent.favorite;
                  setPreviewFavBusy(true);
                  void onQuickUpdate(previewCurrent, { favorite: next }).finally(() => setPreviewFavBusy(false));
                }}
              />
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
    </div>
  );
}

