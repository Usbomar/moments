"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Asset } from "@/lib/types";
import { LazyImage } from "@/components/LazyImage";
import { assignFeaturedHighlights, type GridDistribution } from "@/lib/grid-library";

interface Props {
  items: Asset[];
  /** Només lectura Quadrícula: rajoles grans només per preferides (patró per blocs). */
  distribution?: GridDistribution;
  /** Clic al thumbnail: obre el visor a pantalla completa (prioritat sobre onOpenModal). */
  onOpenViewer?: (asset: Asset, contextItems: Asset[]) => void;
  /** Opcional: només si no hi ha onOpenViewer (p. ex. eines internes). */
  onOpenModal?: (asset: Asset) => void;
  /** Compatibilitat enrere: si no hi ha onOpenViewer ni onOpenModal. */
  onOpen?: (asset: Asset) => void;
}

const placeholderStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: 8,
  textAlign: "center",
  fontSize: 12,
  color: "var(--muted, #68707c)",
  background: "linear-gradient(145deg, #eef1f5, #f9fafb)",
  borderRadius: "inherit"
};

function LibraryTile({
  asset,
  gridItems,
  featured,
  onOpen,
  onOpenModal,
  onOpenViewer
}: {
  asset: Asset;
  gridItems: Asset[];
  featured: boolean;
  onOpen?: (a: Asset) => void;
  onOpenModal?: (a: Asset) => void;
  onOpenViewer?: (a: Asset, contextItems: Asset[]) => void;
}) {
  const thumbUrl = asset.files.thumbUrl?.trim() ?? "";
  const [imgBroken, setImgBroken] = useState(false);

  const handleClick = () => {
    if (onOpenViewer) {
      onOpenViewer(asset, gridItems);
      return;
    }
    if (onOpenModal) {
      onOpenModal(asset);
      return;
    }
    onOpen?.(asset);
  };

  const tileClass = featured ? "tile tile--featured" : "tile";

  if (!thumbUrl || imgBroken) {
    return (
      <button type="button" className={tileClass} onClick={handleClick}>
        <div style={placeholderStyle}>
          <span style={{ fontWeight: 600, color: "var(--text, #151719)" }}>{imgBroken ? "Could not load" : "No image"}</span>
          <span style={{ wordBreak: "break-word", maxWidth: "100%" }}>{asset.title}</span>
        </div>
        {asset.favorite ? <span className="badge">Favorite</span> : null}
      </button>
    );
  }

  return (
    <button type="button" className={tileClass} onClick={handleClick}>
      <LazyImage
        fill
        src={thumbUrl}
        alt={asset.title}
        referrerPolicy="no-referrer"
        onError={() => setImgBroken(true)}
        style={{
          transition: "opacity 180ms ease"
        }}
      />
      {asset.favorite ? <span className="badge">Favorite</span> : null}
    </button>
  );
}

/** Grid of thumbnails with lazy viewport loading, gradient fallback, and onError soft boundary. */
export function LibraryGrid({ items, distribution = "uniform", onOpen, onOpenModal, onOpenViewer }: Props) {
  const featuredFlags = useMemo(
    () => (distribution === "featured" ? assignFeaturedHighlights(items) : items.map(() => false)),
    [items, distribution]
  );

  const gridClass = distribution === "featured" ? "grid grid--featured" : "grid";

  return (
    <div className={gridClass}>
      {items.map((asset, index) => (
        <LibraryTile
          key={`${asset.id}:${asset.files.thumbUrl ?? ""}`}
          asset={asset}
          gridItems={items}
          featured={featuredFlags[index] ?? false}
          onOpen={onOpen}
          onOpenModal={onOpenModal}
          onOpenViewer={onOpenViewer}
        />
      ))}
    </div>
  );
}
