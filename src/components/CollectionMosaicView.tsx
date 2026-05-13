"use client";

import { useMemo, useState } from "react";
import type { Asset } from "@/lib/types";
import type { AppCollection } from "@/lib/collections";
import { LazyImage } from "@/components/LazyImage";

type Props = {
  items: Asset[];
  collections: AppCollection[];
  maxOpen: number;
  onOpenModal: (asset: Asset) => void;
  onOpenViewer: (asset: Asset, contextItems: Asset[]) => void;
};

export function CollectionMosaicView({ items, collections, maxOpen, onOpenModal, onOpenViewer }: Props) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const byId = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const next = [...prev, id];
      return next.slice(-maxOpen);
    });
  };

  return (
    <div className="collection-mosaic-root">
      {collections.map((collection) => {
        const cover = collection.coverAssetId ? byId.get(collection.coverAssetId) : undefined;
        const assets = collection.assetIds.map((id) => byId.get(id)).filter((a): a is Asset => Boolean(a));
        const open = openIds.includes(collection.id);
        const coverUrl = (cover?.files.previewUrl || cover?.files.thumbUrl || cover?.files.originalUrl || "").trim();
        return (
          <section key={collection.id} className="collection-mosaic-section">
            <button type="button" className="collection-mosaic-header" onClick={() => toggleOpen(collection.id)}>
              <span>{collection.name}</span>
              <small>{collection.musicTrack ? `♪ ${collection.musicTrack.title}` : `${assets.length} fotos`}</small>
            </button>
            {open ? (
              <div className="collection-mosaic-grid">
                {assets.map((asset, index) => {
                  const url = (asset.files.previewUrl || asset.files.thumbUrl || asset.files.originalUrl).trim();
                  const big = index === 0;
                  return (
                    <button
                      type="button"
                      key={asset.id}
                      className={`collection-mosaic-item ${big ? "is-big" : ""}`}
                      onClick={() => onOpenViewer(asset, assets)}
                      onDoubleClick={() => onOpenModal(asset)}
                      title={asset.title}
                    >
                      {url ? <LazyImage fill src={url} alt={asset.title} className="collection-mosaic-image" referrerPolicy="no-referrer" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : coverUrl ? (
              <button type="button" className="collection-mosaic-cover" onClick={() => toggleOpen(collection.id)}>
                <LazyImage fill src={coverUrl} alt={collection.name} className="collection-mosaic-image" referrerPolicy="no-referrer" />
                <span className="collection-mosaic-cover-title">{collection.name}</span>
                {collection.musicTrack ? <span className="collection-mosaic-cover-music">♪ {collection.musicTrack.title}</span> : null}
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

