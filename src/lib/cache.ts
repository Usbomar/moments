/** Client-side cache with TTL for API responses (evita fetch redundant amb els mateixos filtres). */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): void {
  store.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
}

export function clearCache(): void {
  store.clear();
}
