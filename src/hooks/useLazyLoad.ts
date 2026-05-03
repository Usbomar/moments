"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const DEFAULT_ROOT_MARGIN = "180px 0px";

export type UseLazyLoadOptions = {
  rootMargin?: string;
  threshold?: number;
  /** Si és true, marca visible immediatament (p. ex. SSR o preferència d’usuari). */
  skip?: boolean;
};

/**
 * IntersectionObserver: `isVisible` passa a true quan l’element entra (o està a prop) del viewport.
 * Útil per diferir `src` d’imatges fins que calgui.
 */
export function useLazyLoad<T extends Element>(options?: UseLazyLoadOptions): {
  ref: RefObject<T | null>;
  isVisible: boolean;
} {
  const ref = useRef<T | null>(null);
  const skip = !!options?.skip;
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (skip) return;
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setRevealed(true));
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          obs.disconnect();
        }
      },
      { root: null, rootMargin: options?.rootMargin ?? DEFAULT_ROOT_MARGIN, threshold: options?.threshold ?? 0.01 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [skip, options?.rootMargin, options?.threshold]);

  return { ref, isVisible: skip || revealed };
}
