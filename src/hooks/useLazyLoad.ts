"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  ref: (node: T | null) => void;
  isVisible: boolean;
} {
  const rootMargin = options?.rootMargin ?? DEFAULT_ROOT_MARGIN;
  const threshold = options?.threshold ?? 0.01;
  const skip = !!options?.skip;

  const revealedRef = useRef(skip);
  const [revealed, setRevealed] = useState(skip);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const reveal = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setRevealed(true);
  }, []);

  useEffect(() => {
    if (skip) reveal();
  }, [skip, reveal]);

  const ref = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!node || skip || revealedRef.current) return;

      if (typeof IntersectionObserver === "undefined") {
        reveal();
        return;
      }

      const obs = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          reveal();
          obs.disconnect();
          if (observerRef.current === obs) observerRef.current = null;
        },
        { root: null, rootMargin, threshold }
      );
      observerRef.current = obs;
      obs.observe(node);
    },
    [skip, rootMargin, threshold, reveal]
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, isVisible: revealed };
}
