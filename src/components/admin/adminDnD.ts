/** Columnes de la taula Fotos (configuració) — ordre persistit a localStorage. */
export type PhotoColumnKey =
  | "thumb"
  | "title"
  | "takenAt"
  | "color"
  | "location"
  | "favorite"
  | "hiddenGuest"
  | "desc"
  | "tags"
  | "collections"
  | "actions";

export const DEFAULT_PHOTO_COLUMNS: PhotoColumnKey[] = [
  "thumb",
  "title",
  "takenAt",
  "color",
  "location",
  "favorite",
  "hiddenGuest",
  "desc",
  "tags",
  "collections",
  "actions"
];

const ALL_PHOTO = new Set<string>(DEFAULT_PHOTO_COLUMNS);

export function normalizePhotoColumnOrder(raw: unknown): PhotoColumnKey[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PHOTO_COLUMNS];
  const seen = new Set<PhotoColumnKey>();
  const out: PhotoColumnKey[] = [];
  for (const item of raw) {
    if (typeof item === "string" && ALL_PHOTO.has(item) && !seen.has(item as PhotoColumnKey)) {
      const k = item as PhotoColumnKey;
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of DEFAULT_PHOTO_COLUMNS) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

/** Columnes visibles segons «Contingut» (desc/tags). */
export function photoColumnsForDisplay(order: PhotoColumnKey[], showContent: boolean): PhotoColumnKey[] {
  return order.filter((k) => showContent || (k !== "desc" && k !== "tags"));
}

export function reorderPhotoColumns(order: PhotoColumnKey[], dragKey: PhotoColumnKey, dropKey: PhotoColumnKey): PhotoColumnKey[] {
  if (dragKey === dropKey) return order;
  const i = order.indexOf(dragKey);
  const j = order.indexOf(dropKey);
  if (i < 0 || j < 0) return order;
  const next = [...order];
  next.splice(i, 1);
  next.splice(j, 0, dragKey);
  return next;
}

export type AdminTabId = "photos" | "libraryGrid" | "guest" | "collections" | "tags" | "locations" | "colors";

/** Ordre antic (v1 localStorage): es substitueix pel nou per defecte si l’usuari no havia reordenat pestanyes. */
export const LEGACY_DEFAULT_TAB_ORDER: AdminTabId[] = [
  "photos",
  "libraryGrid",
  "guest",
  "collections",
  "tags",
  "locations",
  "colors"
];

/** Fotos → Col·leccions → TAGS → Ubicacions → Colors → Graella → Convidat */
export const DEFAULT_TAB_ORDER: AdminTabId[] = [
  "photos",
  "collections",
  "tags",
  "locations",
  "colors",
  "libraryGrid",
  "guest"
];

const ALL_TABS = new Set<string>(DEFAULT_TAB_ORDER);

function tabOrdersEqual(a: readonly AdminTabId[], b: readonly AdminTabId[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Llegeix ordre de pestanyes; migra v1 → v2 si encara tenia el default antic. */
export function loadStoredTabOrder(): AdminTabId[] {
  if (typeof window === "undefined") return [...DEFAULT_TAB_ORDER];
  try {
    const v2 = localStorage.getItem(STORAGE_TAB_ORDER);
    if (v2) return normalizeTabOrder(JSON.parse(v2));
    const v1 = localStorage.getItem(STORAGE_TAB_ORDER_LEGACY);
    if (v1) {
      const order = normalizeTabOrder(JSON.parse(v1));
      if (tabOrdersEqual(order, LEGACY_DEFAULT_TAB_ORDER)) return [...DEFAULT_TAB_ORDER];
      return order;
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_TAB_ORDER];
}

export function normalizeTabOrder(raw: unknown): AdminTabId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TAB_ORDER];
  const seen = new Set<AdminTabId>();
  const out: AdminTabId[] = [];
  for (const item of raw) {
    if (typeof item === "string" && ALL_TABS.has(item) && !seen.has(item as AdminTabId)) {
      const k = item as AdminTabId;
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of DEFAULT_TAB_ORDER) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

export function reorderTabs(order: AdminTabId[], dragId: AdminTabId, dropId: AdminTabId): AdminTabId[] {
  if (dragId === dropId) return order;
  const i = order.indexOf(dragId);
  const j = order.indexOf(dropId);
  if (i < 0 || j < 0) return order;
  const next = [...order];
  next.splice(i, 1);
  next.splice(j, 0, dragId);
  return next;
}

export const STORAGE_PHOTO_COLS = "moments_admin_photo_columns_v1";
export const STORAGE_TAB_ORDER = "moments_admin_tab_order_v2";
export const STORAGE_TAB_ORDER_LEGACY = "moments_admin_tab_order_v1";
