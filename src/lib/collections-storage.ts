export const COLLECTIONS_STORAGE_KEY = "moments_collections_v1";
const COLLECTIONS_STORAGE_LEGACY_KEYS = ["moments_collections", "collections"] as const;

export type StoredCollection = {
  id: string;
  name: string;
  coverAssetId: string | null;
  assetIds: string[];
};

export function loadCollections(): StoredCollection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.localStorage.getItem(COLLECTIONS_STORAGE_KEY) ??
      COLLECTIONS_STORAGE_LEGACY_KEYS.map((k) => window.localStorage.getItem(k)).find((v) => !!v) ??
      null;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        const id = typeof o.id === "string" ? o.id : "";
        const name = typeof o.name === "string" ? o.name : "";
        const coverAssetId = o.coverAssetId === null ? null : typeof o.coverAssetId === "string" ? o.coverAssetId : null;
        const assetIds = Array.isArray(o.assetIds) ? o.assetIds.filter((x): x is string => typeof x === "string") : [];
        if (!id || !name) return null;
        return { id, name, coverAssetId, assetIds } satisfies StoredCollection;
      })
      .filter((x): x is StoredCollection => x != null);
  } catch {
    return [];
  }
}

export function saveCollections(collections: StoredCollection[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify(collections);
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, payload);
    // Mirror en claus antigues per resistir canvis de versió/deploy.
    for (const key of COLLECTIONS_STORAGE_LEGACY_KEYS) {
      window.localStorage.setItem(key, payload);
    }
    window.dispatchEvent(new CustomEvent("moments:collections-changed"));
  } catch {
    /* ignore quota */
  }
}
