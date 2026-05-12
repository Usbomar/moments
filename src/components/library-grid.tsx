"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Asset } from "@/lib/types";
import { LazyImage } from "@/components/LazyImage";
import {
  assignFeaturedHighlights,
  clampTileMinPx,
  gridGapForTileMin,
  GRID_TILE_MIN_PX_DEFAULT,
  normalizeTileHoverFrameScalePercent,
  normalizeTileHoverLiftPx,
  normalizeTileHoverShadowPct,
  normalizeTileImageHoverPercent,
  tileHoverSurfaceBoxShadow,
  TILE_HOVER_FRAME_SCALE_DEFAULT,
  TILE_HOVER_LIFT_DEFAULT,
  TILE_HOVER_SHADOW_DEFAULT,
  type GridDistribution
} from "@/lib/grid-library";

interface Props {
  items: Asset[];
  /** Només lectura Quadrícula: rajoles grans només per preferides (patró per blocs). */
  distribution?: GridDistribution;
  /** Mida mínima de carril en px (`auto-fill` + `minmax`). Per defecte 160. */
  tileMinPx?: number;
  /** Zoom addicional de la imatge en hover; 100 = cap (només l’efecte de la rajola). */
  imageHoverPercent?: number;
  /** Escala del marc sencer (108–130 %). Per defecte 118. */
  tileHoverFrameScalePercent?: number;
  /** Pujada del marc en px (0–14). Per defecte 6. */
  tileHoverLiftPx?: number;
  /** Intensitat de l’ombra (40–160, 100 = referència). Per defecte 100. */
  tileHoverShadowPct?: number;
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
        <span className="tile-surface">
          <span className="tile-crop">
            <div style={placeholderStyle}>
              <span style={{ fontWeight: 600, color: "var(--text, #151719)" }}>{imgBroken ? "Could not load" : "No image"}</span>
              <span style={{ wordBreak: "break-word", maxWidth: "100%" }}>{asset.title}</span>
            </div>
          </span>
          {asset.favorite ? <span className="badge">Favorite</span> : null}
        </span>
      </button>
    );
  }

  return (
    <button type="button" className={tileClass} onClick={handleClick}>
      <span className="tile-surface">
        <span className="tile-crop">
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
        </span>
        {asset.favorite ? <span className="badge">Favorite</span> : null}
      </span>
    </button>
  );
}

/** Grid of thumbnails with lazy viewport loading, gradient fallback, and onError soft boundary. */
export function LibraryGrid({
  items,
  distribution = "uniform",
  tileMinPx: tileMinPxProp,
  imageHoverPercent: imageHoverPercentProp,
  tileHoverFrameScalePercent: frameScaleProp,
  tileHoverLiftPx: liftProp,
  tileHoverShadowPct: shadowProp,
  onOpen,
  onOpenModal,
  onOpenViewer
}: Props) {
  const tileMinPx = clampTileMinPx(tileMinPxProp ?? GRID_TILE_MIN_PX_DEFAULT);
  const gapPx = gridGapForTileMin(tileMinPx);
  const imgHover = normalizeTileImageHoverPercent(imageHoverPercentProp ?? 100);
  const imgScale = imgHover / 100;
  const frameScalePct = normalizeTileHoverFrameScalePercent(frameScaleProp ?? TILE_HOVER_FRAME_SCALE_DEFAULT);
  const liftPx = normalizeTileHoverLiftPx(liftProp ?? TILE_HOVER_LIFT_DEFAULT);
  const shadowPct = normalizeTileHoverShadowPct(shadowProp ?? TILE_HOVER_SHADOW_DEFAULT);
  const frameScale = frameScalePct / 100;
  const hoverShadow = tileHoverSurfaceBoxShadow(liftPx, shadowPct);

  const featuredFlags = useMemo(
    () => (distribution === "featured" ? assignFeaturedHighlights(items) : items.map(() => false)),
    [items, distribution]
  );

  const gridClass = distribution === "featured" ? "grid grid--featured" : "grid";

  const gridStyle = useMemo(
    () =>
      ({
        ["--grid-tile-min" as string]: `${tileMinPx}px`,
        ["--grid-gap" as string]: `${gapPx}px`,
        ["--tile-img-hover-scale" as string]: String(imgScale),
        ["--tile-hover-scale" as string]: String(frameScale),
        ["--tile-hover-lift" as string]: `${liftPx}px`,
        ["--tile-hover-shadow" as string]: hoverShadow
      }) as CSSProperties,
    [tileMinPx, gapPx, imgScale, frameScale, liftPx, hoverShadow]
  );

  return (
    <div className={gridClass} style={gridStyle}>
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
