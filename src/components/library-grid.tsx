"use client";

import type { CSSProperties } from "react";
import type { Asset } from "@/lib/types";

interface Props {
  items: Asset[];
  onOpen: (asset: Asset) => void;
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

function LibraryTile({ asset, onOpen }: { asset: Asset; onOpen: (a: Asset) => void }) {
  const thumbUrl = asset.files.thumbUrl?.trim() ?? "";

  if (!thumbUrl) {
    return (
      <button type="button" className="tile" onClick={() => onOpen(asset)}>
        <div style={placeholderStyle}>
          <span style={{ fontWeight: 600, color: "var(--text, #151719)" }}>No image</span>
          <span style={{ wordBreak: "break-word", maxWidth: "100%" }}>{asset.title}</span>
        </div>
        {asset.favorite ? <span className="badge">Favorite</span> : null}
      </button>
    );
  }

  return (
    <button type="button" className="tile" onClick={() => onOpen(asset)}>
      <img
        src={thumbUrl}
        alt={asset.title}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={(event) => {
          event.currentTarget.style.display = "none";
          const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = "flex";
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transition: "opacity 180ms ease"
        }}
      />
      <div style={{ ...placeholderStyle, display: "none" }}>
        <span style={{ fontWeight: 600, color: "var(--text, #151719)" }}>Could not load</span>
        <span style={{ wordBreak: "break-word", maxWidth: "100%" }}>{asset.title}</span>
      </div>
      {asset.favorite ? <span className="badge">Favorite</span> : null}
    </button>
  );
}

/** Grid of thumbnails with loading gradient, empty URL guard, and onError fallback (soft boundary). */
export function LibraryGrid({ items, onOpen }: Props) {
  return (
    <div className="grid">
      {items.map((asset) => (
        <LibraryTile key={asset.id} asset={asset} onOpen={onOpen} />
      ))}
    </div>
  );
}
