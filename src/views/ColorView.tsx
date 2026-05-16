"use client";

import { useMemo, useState } from "react";
import type { Asset } from "@/lib/types";
import { LibraryGrid } from "@/components/library-grid";
import type { GridDistribution } from "@/lib/grid-library";
import { normalizeHex, resolveAssetColorHex } from "@/lib/color-utils";

interface Props {
  items: Asset[];
  onOpenViewer: (asset: Asset, contextItems: Asset[]) => void;
  onEditPhoto: (asset: Asset) => void;
  distribution?: GridDistribution;
  tileMinPx?: number;
  imageHoverPercent?: number;
  tileHoverFrameScalePercent?: number;
  tileHoverLiftPx?: number;
  tileHoverShadowPct?: number;
}

interface ColorBucket {
  hex: string;
  items: Asset[];
}

function buildBuckets(items: Asset[]): ColorBucket[] {
  const buckets = new Map<string, ColorBucket>();
  for (const asset of items) {
    const hex = resolveAssetColorHex(asset);
    if (!hex) continue;
    const existing = buckets.get(hex);
    if (existing) {
      existing.items.push(asset);
      continue;
    }
    buckets.set(hex, { hex, items: [asset] });
  }
  return Array.from(buckets.values()).sort((a, b) => a.hex.localeCompare(b.hex));
}

export function ColorView({
  items,
  onOpenViewer,
  onEditPhoto,
  distribution = "uniform",
  tileMinPx,
  imageHoverPercent,
  tileHoverFrameScalePercent,
  tileHoverLiftPx,
  tileHoverShadowPct
}: Props) {
  const buckets = useMemo(() => buildBuckets(items), [items]);
  const [activeHex, setActiveHex] = useState<string | null>(null);

  const withoutColor = useMemo(() => items.filter((a) => !resolveAssetColorHex(a)), [items]);

  const visible = useMemo(() => {
    if (activeHex == null) return items;
    const bucket = buckets.find((b) => b.hex === activeHex);
    return bucket?.items ?? [];
  }, [activeHex, buckets, items]);

  return (
    <div>
      <p className="modal-muted" style={{ marginBottom: 12, maxWidth: 720 }}>
        Els grups de color només inclouen fotos on hagis triat un color a l’editor de dades (paleta o selector lliure). La resta
        es mostra a la graella quan no hi ha filtre actiu.
      </p>

      {buckets.length > 0 ? (
        <div className="hue-filter-bar" role="toolbar" aria-label="Filtrar per color assignat">
          {buckets.map((bucket) => {
            const h = normalizeHex(bucket.hex)!;
            return (
              <button
                key={h}
                type="button"
                className={activeHex === h ? "active" : ""}
                onClick={() => setActiveHex((prev) => (prev === h ? null : h))}
                aria-pressed={activeHex === h}
                aria-label={`Color ${h}, ${bucket.items.length} fotos`}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 0,
                    background: h,
                    border: h === "#fafafa" || h === "#ffffff" ? "1px solid var(--border-dark)" : "1px solid var(--border-dark)"
                  }}
                />
                {bucket.items.length}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="view-empty" style={{ marginBottom: 12 }}>
          Encara no hi ha cap foto amb color assignat. Obre una foto i tria un color amb el desplegable o el selector.
        </p>
      )}

      {activeHex == null && withoutColor.length > 0 ? (
        <p className="modal-muted" style={{ marginBottom: 8 }}>
          {withoutColor.length} foto(s) sense color assignat (es mostren a la graella inferior).
        </p>
      ) : null}

      <LibraryGrid
        items={visible}
        distribution={distribution}
        tileMinPx={tileMinPx}
        imageHoverPercent={imageHoverPercent}
        tileHoverFrameScalePercent={tileHoverFrameScalePercent}
        tileHoverLiftPx={tileHoverLiftPx}
        tileHoverShadowPct={tileHoverShadowPct}
        onOpenModal={onEditPhoto}
        onOpenViewer={onOpenViewer}
      />
    </div>
  );
}
