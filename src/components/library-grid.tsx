"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Asset } from "@/lib/types";

interface Props {
  items: Asset[];
  onOpen: (asset: Asset) => void;
}

type LoadState = "loading" | "loaded" | "error";

const skeletonStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(145deg, #e4e9ef 0%, #f6f7f9 45%, #dce3ec 100%)",
  pointerEvents: "none",
  borderRadius: "inherit"
};

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
  const [loadState, setLoadState] = useState<LoadState>(() => (thumbUrl ? "loading" : "error"));

  useEffect(() => {
    if (!thumbUrl) {
      setLoadState("error");
      return;
    }
    // Debug: remove in production if noisy.
    console.log(`Loading thumb: ${thumbUrl}`);
    setLoadState("loading");
  }, [thumbUrl, asset.id]);

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
      {loadState === "loading" ? <div style={skeletonStyle} aria-hidden /> : null}
      {loadState === "error" ? (
        <div style={placeholderStyle}>
          <span style={{ fontWeight: 600, color: "var(--text, #151719)" }}>Could not load</span>
          <span style={{ wordBreak: "break-word", maxWidth: "100%" }}>{asset.title}</span>
        </div>
      ) : (
        <img
          src={thumbUrl}
          alt={asset.title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoadState("loaded")}
          onError={() => setLoadState("error")}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: loadState === "loaded" ? 1 : 0,
            transition: "opacity 180ms ease"
          }}
        />
      )}
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
