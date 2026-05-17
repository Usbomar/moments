"use client";

import { useEffect, useRef } from "react";
import type { Asset } from "@/lib/types";

function thumbUrl(asset: Asset): string {
  return (asset.files.thumbUrl || asset.files.previewUrl || asset.files.originalUrl).trim();
}

export type SliderFilmstripProps = {
  items: Asset[];
  orderedIndices: number[];
  currentIndex: number;
  onJumpToIndex: (index: number) => void;
};

export function SliderFilmstrip({ items, orderedIndices, currentIndex, onJumpToIndex }: SliderFilmstripProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector(".slider-filmstrip__item.is-active");
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentIndex]);

  if (orderedIndices.length < 2) return null;

  return (
    <div ref={stripRef} className="slider-filmstrip" role="tablist" aria-label="Miniatures del slider">
      {orderedIndices.map((idx, pos) => {
        const asset = items[idx];
        if (!asset) return null;
        const thumb = thumbUrl(asset);
        return (
          <button
            key={asset.id}
            type="button"
            role="tab"
            aria-selected={idx === currentIndex}
            aria-label={`${asset.title}, foto ${pos + 1} de ${orderedIndices.length}`}
            className={`slider-filmstrip__item${idx === currentIndex ? " is-active" : ""}`}
            onClick={() => onJumpToIndex(idx)}
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" referrerPolicy="no-referrer" decoding="async" />
            ) : (
              <span className="slider-filmstrip__fallback" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}
