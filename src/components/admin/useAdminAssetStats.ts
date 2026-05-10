"use client";

import { useMemo } from "react";
import type { Asset } from "@/lib/types";
import { cmpText } from "@/components/admin/adminAssetHelpers";

export type SortKey = "title" | "takenAt" | "color" | "location" | "favorite";
export type SortState = { key: SortKey; dir: "asc" | "desc" };

export function useAdminAssetStats(assets: Asset[], sort: SortState[]) {
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

  return { tagStats, locationStats, tagsToAssets, locationsToAssets, assetById, sorted };
}
