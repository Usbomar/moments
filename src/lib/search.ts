import type { Asset } from "@/lib/types";

export interface SearchFilters {
  query?: string;
  datePrefix?: string;
  city?: string;
  favoriteOnly?: boolean;
}

export function filterAssets(input: Asset[], filters: SearchFilters): Asset[] {
  return input.filter((asset) => {
    if (filters.favoriteOnly && !asset.favorite) return false;
    if (filters.datePrefix && !asset.takenAt.startsWith(filters.datePrefix)) return false;
    if (filters.city && asset.location?.city.toLowerCase() !== filters.city.toLowerCase()) return false;
    if (!filters.query) return true;
    const q = filters.query.toLowerCase();
    return (
      asset.title.toLowerCase().includes(q) ||
      (asset.description?.toLowerCase().includes(q) ?? false) ||
      asset.tags.some((t) => t.includes(q)) ||
      asset.autoTags.some((t) => t.includes(q)) ||
      asset.location?.city.toLowerCase().includes(q) ||
      false
    );
  });
}
