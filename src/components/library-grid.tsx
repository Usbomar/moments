"use client";

import type { CSSProperties } from "react";
import type { Asset } from "@/lib/types";

interface Props {
  items: Asset[];
  /** Clic al thumbnail: obre el visor a pantalla completa (prioritat sobre onOpenModal). */
  onOpenViewer?: (asset: Asset) => void;
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
  onOpen,
  onOpenModal,
  onOpenViewer
}: {
  asset: Asset;
  onOpen?: (a: Asset) => void;
  onOpenModal?: (a: Asset) => void;
  onOpenViewer?: (a: Asset) => void;
}) {
  const thumbUrl = asset.files.thumbUrl?.trim() ?? "";

  const handleClick = () => {
    if (onOpenViewer) {
      onOpenViewer(asset);
      return;
    }
    if (onOpenModal) {
      onOpenModal(asset);
      return;
    }
    onOpen?.(asset);
  };

  if (!thumbUrl) {
    return (
      <button type="button" className="tile" onClick={handleClick}>
        <div style={placeholderStyle}>
          <span style={{ fontWeight: 600, color: "var(--text, #151719)" }}>No image</span>
          <span style={{ wordBreak: "break-word", maxWidth: "100%" }}>{asset.title}</span>
        </div>
        {asset.favorite ? <span className="badge">Favorite</span> : null}
      </button>
    );
  }

  return (
    <button type="button" className="tile" onClick={handleClick}>
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
export function LibraryGrid({ items, onOpen, onOpenModal, onOpenViewer }: Props) {
  return (
    <div className="grid">
      {items.map((asset) => (
        <LibraryTile key={asset.id} asset={asset} onOpen={onOpen} onOpenModal={onOpenModal} onOpenViewer={onOpenViewer} />
      ))}
    </div>
  );
}
