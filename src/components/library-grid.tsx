"use client";

import Image from "next/image";
import type { Asset } from "@/lib/types";

interface Props {
  items: Asset[];
  onOpen: (asset: Asset) => void;
}

export function LibraryGrid({ items, onOpen }: Props) {
  return (
    <div className="grid">
      {items.map((asset) => (
        <button className="tile" key={asset.id} onClick={() => onOpen(asset)}>
          <Image src={asset.files.thumbUrl} alt={asset.title} fill sizes="250px" loading="lazy" />
          {asset.favorite ? <span className="badge">Favorite</span> : null}
        </button>
      ))}
    </div>
  );
}
