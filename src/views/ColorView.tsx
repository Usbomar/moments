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

/** Només fotos amb `colorHue` assignat manualment a l’editor (sense cap valor per defecte de l’app). */
function buildBuckets(items: Asset[]): ColorBucket[] {
  const buckets = new Map<number, ColorBucket>();
  for (const asset of items) {
    if (typeof asset.colorHue !== "number" || !Number.isFinite(asset.colorHue)) continue;
    const hue = Math.min(359, Math.max(0, Math.round(asset.colorHue)));
    const key = (Math.round(hue / 30) * 30) % 360;
    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(asset);
      continue;
    }
    buckets.set(key, {
      hue: key,
      color: `hsl(${key} 72% 46%)`,
      items: [asset]
    });
  }
  return Array.from(buckets.values()).sort((a, b) => a.hue - b.hue);
}

export function ColorView({ items, onOpenViewer, onEditPhoto }: Props) {
  const buckets = useMemo(() => buildBuckets(items), [items]);
  const [activeHue, setActiveHue] = useState<number | null>(null);

  const withoutColor = useMemo(
    () => items.filter((a) => typeof a.colorHue !== "number" || !Number.isFinite(a.colorHue)),
    [items]
  );

  const visible = useMemo(() => {
    if (activeHue == null) return items;
    const bucket = buckets.find((b) => b.hue === activeHue);
    return bucket?.items ?? [];
  }, [activeHue, buckets, items]);

  return (
    <div>
      <p className="modal-muted" style={{ marginBottom: 12, maxWidth: 720 }}>
        Els grups de color només inclouen fotos on hagis triat el to a l’editor de dades. La resta es mostra a la graella
        quan no hi ha filtre actiu; assigna un color des de «Editar foto».
      </p>

      {buckets.length > 0 ? (
        <div className="hue-filter-bar" role="toolbar" aria-label="Filtrar per to assignat">
          {buckets.map((bucket) => (
            <button
              key={bucket.hue}
              type="button"
              className={activeHue === bucket.hue ? "active" : ""}
              onClick={() => setActiveHue((prev) => (prev === bucket.hue ? null : bucket.hue))}
              aria-pressed={activeHue === bucket.hue}
              aria-label={`To ${bucket.hue}°, ${bucket.items.length} fotos`}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 0,
                  background: bucket.color,
                  border: "1px solid var(--border-dark)"
                }}
              />
              {bucket.items.length}
            </button>
          ))}
        </div>
      ) : (
        <p className="view-empty" style={{ marginBottom: 12 }}>
          Encara no hi ha cap foto amb color assignat. Obre una foto, desa un to (0–359) o esborra’l si no el vols.
        </p>
      )}

      {activeHue == null && withoutColor.length > 0 ? (
        <p className="modal-muted" style={{ marginBottom: 8 }}>
          {withoutColor.length} foto(s) sense color assignat (es mostren a la graella inferior).
        </p>
      ) : null}

      <LibraryGrid items={visible} onOpenModal={onEditPhoto} onOpenViewer={onOpenViewer} />
    </div>
  );
}
