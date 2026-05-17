"use client";

import type { Asset } from "@/lib/types";
import { formatMonthLabelCa, getAssetDate } from "@/lib/slider-temporal-nav";

export type SliderMetadataStripProps = {
  asset: Asset | null;
  positionLabel: string;
};

export function SliderMetadataStrip({ asset, positionLabel }: SliderMetadataStripProps) {
  if (!asset) return null;

  const d = getAssetDate(asset);
  const dateText = d
    ? `${d.getDate()} ${formatMonthLabelCa(d)} ${d.getFullYear()}`
    : "Sense data";
  const locationText = asset.location?.city?.trim()
    ? [asset.location.city, asset.location.country].filter(Boolean).join(", ")
    : null;

  return (
    <div className="slider-metadata-strip" aria-label="Metadades de la foto">
      <div className="slider-metadata-strip__main">
        <strong className="slider-metadata-strip__title" title={asset.title}>
          {asset.title}
        </strong>
        <span className="slider-metadata-strip__date">{dateText}</span>
        {locationText ? <span className="slider-metadata-strip__location">{locationText}</span> : null}
      </div>
      <span className="slider-metadata-strip__pos">{positionLabel}</span>
    </div>
  );
}
