"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const HIDE_DELAY_MS = 600;

type Props = {
  children: ReactNode;
};

/**
 * Barra superior amagada en mode presentació; es mostra en passar el ratolí pel marge superior
 * o sobre la pròpia barra, i s’amaga en sortir (mouseover / mouseout).
 */
export function RetractableTopBarZone({ children }: Props) {
  const [revealed, setRevealed] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverStripRef = useRef(false);
  const hoverBarRef = useRef(false);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearHideTimer();
    setRevealed(true);
  }, [clearHideTimer]);

  const tryHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      if (hoverStripRef.current || hoverBarRef.current) return;
      setRevealed(false);
    }, HIDE_DELAY_MS);
  }, [clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  return (
    <div className={`moments-topbar-zone moments-topbar-zone--auto-hide${revealed ? " is-revealed" : ""}`}>
      <div
        className="moments-topbar-reveal-hit"
        aria-hidden
        onMouseEnter={() => {
          hoverStripRef.current = true;
          show();
        }}
        onMouseLeave={() => {
          hoverStripRef.current = false;
          tryHide();
        }}
      />
      <div
        className="moments-topbar-hover-wrap"
        onMouseEnter={() => {
          hoverBarRef.current = true;
          show();
        }}
        onMouseLeave={() => {
          hoverBarRef.current = false;
          tryHide();
        }}
        onFocusCapture={show}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) tryHide();
        }}
      >
        {children}
      </div>
    </div>
  );
}
