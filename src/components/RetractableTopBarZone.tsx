"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

const HIDE_DELAY_MS = 450;

type Props = {
  children: ReactNode;
};

/** Mostra la barra superior en passar el ratolí pel marge superior; la amaga en sortir. */
export function RetractableTopBarZone({ children }: Props) {
  const [revealed, setRevealed] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setRevealed(false), HIDE_DELAY_MS);
  }, [clearHideTimer]);

  return (
    <div
      className={`moments-topbar-zone moments-topbar-zone--auto-hide${revealed ? " is-revealed" : ""}`}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocusCapture={show}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleHide();
      }}
    >
      <div className="moments-topbar-reveal-hit" aria-hidden />
      {children}
    </div>
  );
}
