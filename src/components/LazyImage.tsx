"use client";

/* Imatges remotes signades: `next/image` no aplica; carrega explícita + lazy IO. */
/* eslint-disable @next/next/no-img-element */

import type { CSSProperties } from "react";
import { useLazyLoad } from "@/hooks/useLazyLoad";

const BLUR_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#eef1f5"/><stop offset="100%" stop-color="#e2e6ea"/>
      </linearGradient></defs>
      <rect width="64" height="64" fill="url(#g)"/>
    </svg>`
  );

type Props = {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  sizes?: string;
  /** Mostra placeholder SVG fins que entri al viewport o carregui. */
  placeholderSrc?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  decoding?: "async" | "auto" | "sync";
  skipLazy?: boolean;
  /** Omple el contenidor pare (p. ex. `position: relative` + inset). */
  fill?: boolean;
};

/**
 * Imatge amb càrrega diferida via IntersectionObserver; mentrestant placeholder lleuger.
 */
export function LazyImage({
  src,
  alt,
  className,
  style,
  sizes,
  placeholderSrc = BLUR_SVG,
  onError,
  onClick,
  referrerPolicy = "no-referrer",
  decoding = "async",
  skipLazy = false,
  fill = false
}: Props) {
  const { ref, isVisible } = useLazyLoad<HTMLSpanElement>({ skip: skipLazy });

  const wrapStyle: CSSProperties = fill
    ? { position: "absolute", inset: 0, display: "block" }
    : { position: "relative", display: "block", width: "100%", height: "100%" };

  const imgStyle: CSSProperties = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...style }
    : { ...(style ?? {}) };

  return (
    <span ref={ref} style={wrapStyle}>
      {isVisible ? (
        <img
          src={src}
          alt={alt}
          className={className}
          style={imgStyle}
          sizes={sizes}
          loading="lazy"
          decoding={decoding}
          referrerPolicy={referrerPolicy}
          onError={onError}
          onClick={onClick}
        />
      ) : (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden
          className={className}
          style={{ ...imgStyle, objectFit: "cover" }}
          decoding="async"
        />
      )}
    </span>
  );
}
