"use client";

import { useEffect, type RefObject } from "react";

export type KeyboardShortcutsOptions = {
  /** Ref al camp de cerca global (Cmd/Ctrl+K). */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Si és true, no centrar la cerca amb Cmd/Ctrl+K. */
  isModalOpen?: boolean;
  /**
   * Escape amb modal obert (excepte editor d’imatge, que té la seva pròpia cadena Escape).
   * Tancar visor / PhotoModal en ordre segur.
   */
  onModalEscape?: () => void;
};

/**
 * Dreceres globals: Cmd/Ctrl+K centra la cerca; Escape enllaça el blur del camp de cerca
 * o delega el tancament de modals al callback.
 */
export function useKeyboardShortcuts({
  searchInputRef,
  isModalOpen = false,
  onModalEscape
}: KeyboardShortcutsOptions): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!isModalOpen) {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }
        return;
      }
      if (e.key === "Escape") {
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
          return;
        }
        if (isModalOpen && typeof onModalEscape === "function") {
          onModalEscape();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchInputRef, isModalOpen, onModalEscape]);
}
