"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LibraryGridPreferencesPanel } from "@/components/LibraryGridPreferencesPanel";
import type { LibraryGridPreferencesBinder } from "@/lib/grid-library";

type Props = LibraryGridPreferencesBinder;

export function GridOptionsPopover(props: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  return (
    <div className="grid-options-popover-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-sm btn-ghost grid-options-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="grid-options-panel"
        title="Opcions de graella"
        onClick={toggle}
      >
        <span className="grid-options-trigger-icon" aria-hidden>
          ⧉
        </span>
      </button>
      {open ? (
        <div id="grid-options-panel" className="grid-options-panel" role="dialog" aria-label="Opcions de graella">
          <LibraryGridPreferencesPanel variant="popover" {...props} />
        </div>
      ) : null}
    </div>
  );
}
