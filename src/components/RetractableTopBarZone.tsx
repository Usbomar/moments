"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const HIDE_DELAY_MS = 400;
const TOP_EDGE_PX = 48;

type Props = {
  children: ReactNode;
};

/**
 * Barra superior amagada durant la presentació; es mostra en acostar el punter al marge superior
 * o mentre el punter és sobre la barra (funciona encara amb el slideshow a pantalla completa).
 */
export function RetractableTopBarZone({ children }: Props) {
  const [revealed, setRevealed] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

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

  const pointerOverZone = useCallback((clientX: number, clientY: number) => {
    const el = zoneRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (e.clientY <= TOP_EDGE_PX || pointerOverZone(e.clientX, e.clientY)) {
        show();
        return;
      }
      scheduleHide();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [pointerOverZone, scheduleHide, show]);

  return (
    <div
      ref={zoneRef}
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
