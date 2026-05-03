"use client";

import { useMemo, useState } from "react";
import type { Asset } from "@/lib/types";
import { LibraryGrid } from "@/components/library-grid";

interface Props {
  items: Asset[];
  onOpenViewer: (asset: Asset) => void;
  onEditPhoto: (asset: Asset) => void;
}

interface ColorBucket {
  hue: number;
  color: string;
  items: Asset[];
}

function hueFromChecksum(checksum: string): number {
  let hash = 0;
  for (let i = 0; i < checksum.length; i += 1) {
    hash = (hash * 31 + checksum.charCodeAt(i)) % 360;
  }
  return hash;
}

function buildBuckets(items: Asset[]): ColorBucket[] {
  const buckets = new Map<number, ColorBucket>();
  for (const asset of items) {
    const hue = Math.round(hueFromChecksum(asset.files.checksum || asset.id) / 30) * 30;
    const key = hue % 360;
    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(asset);
      continue;
    }
    buckets.set(key, {
      hue: key,
      color: `hsl(${key} 75% 52%)`,
      items: [asset]
    });
  }
  return Array.from(buckets.values()).sort((a, b) => a.hue - b.hue);
}

export function ColorView({ items, onOpenViewer, onEditPhoto }: Props) {
  const buckets = useMemo(() => buildBuckets(items), [items]);
  const [activeHue, setActiveHue] = useState<number | null>(null);

  const visible = useMemo(() => {
    if (activeHue == null) return items;
    const bucket = buckets.find((b) => b.hue === activeHue);
    return bucket?.items ?? [];
  }, [activeHue, buckets, items]);

  return (
    <div>
      <div className="controls" style={{ marginBottom: 12 }}>
        {buckets.map((bucket) => (
          <button
            key={bucket.hue}
            type="button"
            className={activeHue === bucket.hue ? "active" : ""}
            onClick={() => setActiveHue((prev) => (prev === bucket.hue ? null : bucket.hue))}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span style={{ width: 16, height: 16, borderRadius: 999, background: bucket.color, border: "1px solid rgba(0,0,0,.15)" }} />
            {bucket.items.length}
          </button>
        ))}
      </div>

      <LibraryGrid items={visible} onOpenModal={onEditPhoto} onOpenViewer={onOpenViewer} />
    </div>
  );
}
