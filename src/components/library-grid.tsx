"use client";

import type { Asset } from "@/lib/types";

interface Props {
  items: Asset[];
  onOpen: (asset: Asset) => void;
}

/** Native img: signed Supabase URLs often break under next/image (remotePatterns / optimizer). */
export function LibraryGrid({ items, onOpen }: Props) {
  return (
    <div className="grid">
      {items.map((asset) => (
        <button className="tile" key={asset.id} onClick={() => onOpen(asset)}>
          <img
            src={asset.files.thumbUrl}
            alt={asset.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
          {asset.favorite ? <span className="badge">Favorite</span> : null}
        </button>
      ))}
    </div>
  );
}
