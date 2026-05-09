"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Asset } from "@/lib/types";

interface Props {
  items: Asset[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEditDetails?: (asset: Asset) => void;
  onEditImage?: (asset: Asset) => void;
}

/** Matches library-grid placeholder look (gray gradient + centered text). */
const placeholderStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: 24,
  textAlign: "center",
  fontSize: 14,
  color: "var(--muted, #68707c)",
  background: "linear-gradient(145deg, #eef1f5, #f9fafb)",
  minHeight: "40vh",
  width: "100%",
  borderRadius: 12,
  boxSizing: "border-box"
};

const pencilIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const imageEditIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

type SlideProps = {
  current: Asset;
  index: number;
  items: Asset[];
  onSelect: (id: string) => void;
  onClose: () => void;
  onEditDetails?: (asset: Asset) => void;
  onEditImage?: (asset: Asset) => void;
};

/** `key={selectedId}` al muntar reinicia el zoom sense efectes. */
function ViewerSlide({ current, index, items, onSelect, onClose, onEditDetails, onEditImage }: SlideProps) {
  const [zoom, setZoom] = useState<1 | 2>(1);
  const previewUrl = (current.files.mediumUrl || current.files.previewUrl)?.trim() ?? "";
  const takenAtText = new Date(current.takenAt).toLocaleDateString("ca-ES", { day: "numeric", month: "long", year: "numeric" });
  const locationText = current.location ? `${current.location.city}${current.location.country ? `, ${current.location.country}` : ""}` : "";

  useEffect(() => {
    const contentFrame = document.querySelector(".viewer-content-frame");
    const frame = document.querySelector(".viewer-media-frame");
    const image = document.querySelector(".viewer-media--framed");
    const caption = document.querySelector(".viewer-caption-card--framed");
    const contentFrameStyle = contentFrame ? window.getComputedStyle(contentFrame) : null;
    const frameStyle = frame ? window.getComputedStyle(frame) : null;
    const imageStyle = image ? window.getComputedStyle(image) : null;
    const captionStyle = caption ? window.getComputedStyle(caption) : null;
    const contentRect = contentFrame?.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    const captionRect = caption?.getBoundingClientRect();
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    const contentCenterX = contentRect ? contentRect.left + contentRect.width / 2 : null;
    const contentCenterY = contentRect ? contentRect.top + contentRect.height / 2 : null;
    // #region agent log
    fetch("http://127.0.0.1:7454/ingest/404cef76-724a-4eae-b86e-2c4b6c9c679d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "634310" },
      body: JSON.stringify({
        sessionId: "634310",
        runId: "frame-debug-1",
        hypothesisId: "H2",
        location: "src/components/fullscreen-viewer.tsx:ViewerSlide.useEffect",
        message: "Viewer slide style snapshot",
        data: {
          assetId: current.id,
          hasPreviewUrl: !!previewUrl,
          contentFrameFound: !!contentFrame,
          contentFrameBorder: contentFrameStyle?.border ?? null,
          contentFrameBackground: contentFrameStyle?.backgroundColor ?? null,
          contentFrameWidth: contentRect?.width ?? null,
          contentFrameHeight: contentRect?.height ?? null,
          contentFrameLeft: contentRect?.left ?? null,
          contentFrameRight: contentRect?.right ?? null,
          contentFrameTop: contentRect?.top ?? null,
          contentFrameBottom: contentRect?.bottom ?? null,
          viewportCenterX,
          viewportCenterY,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          contentCenterX,
          contentCenterY,
          centerDeltaX: contentCenterX !== null ? Number((contentCenterX - viewportCenterX).toFixed(2)) : null,
          centerDeltaY: contentCenterY !== null ? Number((contentCenterY - viewportCenterY).toFixed(2)) : null,
          viewportUsageWPercent:
            contentRect?.width ? Number(((contentRect.width / window.innerWidth) * 100).toFixed(2)) : null,
          viewportUsageHPercent:
            contentRect?.height ? Number(((contentRect.height / window.innerHeight) * 100).toFixed(2)) : null,
          frameFound: !!frame,
          framePadding: frameStyle?.padding ?? null,
          frameBackground: frameStyle?.backgroundColor ?? null,
          frameBorder: frameStyle?.border ?? null,
          imageFound: !!image,
          imageWidth: imageRect?.width ?? null,
          imageHeight: imageRect?.height ?? null,
          imageMaxWidth: imageStyle?.maxWidth ?? null,
          imageMaxHeight: imageStyle?.maxHeight ?? null,
          captionWidth: captionRect?.width ?? null,
          captionHeight: captionRect?.height ?? null,
          captionFound: !!caption,
          captionPadding: captionStyle?.padding ?? null,
          captionBackground: captionStyle?.backgroundColor ?? null,
          captionBorder: captionStyle?.border ?? null,
          captionMarginTop: captionStyle?.marginTop ?? null
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
  }, [current.id, previewUrl]);

  return (
    <>
      <div className="viewer-content-frame">
        <button
          type="button"
          className="viewer-close"
          onClick={onClose}
          aria-label="Tancar visor"
          title="Tancar"
        >
          ×
        </button>
        {previewUrl ? (
          <div className="viewer-media-frame">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL signades / visor */}
            <img
              className={`viewer-media viewer-media--framed ${zoom === 2 ? "is-zoomed" : ""}`}
              src={previewUrl}
              alt={current.title}
              width={current.width || undefined}
              height={current.height || undefined}
              fetchPriority="high"
              referrerPolicy="no-referrer"
              style={{ cursor: zoom === 2 ? "zoom-out" : "default" }}
              onClick={(e) => {
                if (zoom === 2) {
                  e.stopPropagation();
                  setZoom(1);
                }
              }}
            />
          </div>
        ) : (
          <div className="viewer-media-frame">
            <div className="viewer-media" style={placeholderStyle} role="img" aria-label="Imatge no disponible">
              <span style={{ fontWeight: 600, color: "var(--text, #151719)" }}>Imatge no disponible</span>
              <span style={{ wordBreak: "break-word", maxWidth: "100%" }}>{current.title}</span>
            </div>
          </div>
        )}
        <div className="viewer-caption-card viewer-caption-card--framed">
          <strong className="viewer-caption-title">{current.title}</strong>
          {current.description?.trim() ? <p className="viewer-caption-text">{current.description.trim()}</p> : null}
          <p className="viewer-caption-meta">
            {takenAtText}
            {locationText ? ` · ${locationText}` : ""}
          </p>
        </div>
      </div>
      <div className="viewer-toolbar" role="toolbar" aria-label="Navegació, edició i zoom">
        <button type="button" className="viewer-toolbar-btn" disabled={index <= 0} onClick={() => index > 0 && onSelect(items[index - 1]!.id)}>
          ←
        </button>
        {onEditDetails ? (
          <button
            type="button"
            className="viewer-toolbar-btn viewer-toolbar-btn--icon viewer-toolbar-btn--subtle"
            onClick={() => onEditDetails(current)}
            aria-label="Editar informació de la foto"
            title="Editar informació"
          >
            {pencilIcon}
          </button>
        ) : null}
        {onEditImage ? (
          <button
            type="button"
            className="viewer-toolbar-btn viewer-toolbar-btn--icon viewer-toolbar-btn--subtle"
            onClick={() => onEditImage(current)}
            aria-label="Editar la imatge"
            title="Editar imatge"
          >
            {imageEditIcon}
          </button>
        ) : null}
        <button type="button" className="viewer-toolbar-btn" onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}>
          {zoom === 1 ? "Zoom x2" : "Zoom x1"}
        </button>
        <button
          type="button"
          className="viewer-toolbar-btn"
          disabled={index >= items.length - 1}
          onClick={() => index < items.length - 1 && onSelect(items[index + 1]!.id)}
        >
          →
        </button>
      </div>
    </>
  );
}

export function FullscreenViewer({ items, selectedId, onClose, onSelect, onEditDetails, onEditImage }: Props) {
  const index = items.findIndex((x) => x.id === selectedId);
  const current = index >= 0 ? items[index] : null;

  useEffect(() => {
    const viewerInner = document.querySelector(".viewer-inner--framed");
    const viewerRoot = document.querySelector(".viewer");
    const closeBtn = document.querySelector(".viewer-close");
    const contentFrame = document.querySelector(".viewer-content-frame");
    const innerStyle = viewerInner ? window.getComputedStyle(viewerInner) : null;
    const rootStyle = viewerRoot ? window.getComputedStyle(viewerRoot) : null;
    const closeStyle = closeBtn ? window.getComputedStyle(closeBtn) : null;
    const closeRect = closeBtn?.getBoundingClientRect();
    const contentRect = contentFrame?.getBoundingClientRect();
    // #region agent log
    fetch("http://127.0.0.1:7454/ingest/404cef76-724a-4eae-b86e-2c4b6c9c679d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "634310" },
      body: JSON.stringify({
        sessionId: "634310",
        runId: "frame-debug-1",
        hypothesisId: "H3",
        location: "src/components/fullscreen-viewer.tsx:FullscreenViewer.useEffect",
        message: "Fullscreen viewer render state",
        data: {
          selectedId,
          itemsCount: items.length,
          resolvedIndex: index,
          resolvedAssetId: current?.id ?? null,
          viewerInnerFound: !!viewerInner,
          viewerInnerPadding: innerStyle?.padding ?? null,
          viewerInnerBackground: innerStyle?.backgroundColor ?? null,
          viewerInnerBorderColor: innerStyle?.borderColor ?? null,
          viewerRootBackground: rootStyle?.backgroundColor ?? null,
          closeFound: !!closeBtn,
          closeTop: closeRect?.top ?? null,
          closeRight: closeRect?.right ?? null,
          closeLeft: closeRect?.left ?? null,
          closePosition: closeStyle?.position ?? null,
          closeOffsetTop: closeStyle?.top ?? null,
          closeOffsetRight: closeStyle?.right ?? null,
          contentFrameFound: !!contentFrame,
          contentFrameTop: contentRect?.top ?? null,
          contentFrameRight: contentRect?.right ?? null,
          contentFrameLeft: contentRect?.left ?? null
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
  }, [current?.id, index, items.length, selectedId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!current) return;
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onSelect(items[index - 1]!.id);
      if (event.key === "ArrowRight" && index < items.length - 1) onSelect(items[index + 1]!.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, index, items, onClose, onSelect]);

  if (!current || selectedId == null) return null;

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Visor de fotos a pantalla completa" onClick={onClose}>
      <div className="viewer-inner viewer-inner--framed" onClick={(e) => e.stopPropagation()}>
        <ViewerSlide
          key={selectedId}
          current={current}
          index={index}
          items={items}
          onSelect={onSelect}
          onClose={onClose}
          onEditDetails={onEditDetails}
          onEditImage={onEditImage}
        />
      </div>
    </div>
  );
}
