"use client";

import { useEffect, useMemo, useState } from "react";
import type { Asset } from "@/lib/types";

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
}

export type AdminAssetPickerModalProps = {
  open: boolean;
  title: string;
  subtitle: string;
  /** Mateix conjunt que abans es calculava com a «addable»: només fotos que es poden afegir. */
  availableAssets: Asset[];
  emptyWhenNoEligible: string;
  onClose: () => void;
  onConfirm: (selectedIds: string[]) => Promise<void>;
};

export function AdminAssetPickerModal({
  open,
  title,
  subtitle,
  availableAssets,
  emptyWhenNoEligible,
  onClose,
  onConfirm
}: AdminAssetPickerModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIds([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    let list = [...availableAssets];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const titleLower = (a.title ?? "").toLowerCase();
        const dateStr = (a.takenAt ?? "").slice(0, 10);
        return titleLower.includes(q) || dateStr.includes(q);
      });
    }
    list.sort((a, b) => cmpText(b.takenAt ?? "", a.takenAt ?? ""));
    return list;
  }, [availableAssets, query]);

  const toggle = (assetId: string) => {
    setSelectedIds((prev) => (prev.includes(assetId) ? prev.filter((x) => x !== assetId) : [...prev, assetId]));
  };

  const selectAllVisible = () => setSelectedIds(filtered.map((a) => a.id));
  const clearSelection = () => setSelectedIds([]);

  const emptyMessage = useMemo(() => {
    if (filtered.length > 0) return null;
    if (query.trim()) return "Cap foto coincideix amb la cerca.";
    return emptyWhenNoEligible;
  }, [emptyWhenNoEligible, filtered.length, query]);

  const handleConfirm = async () => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      await onConfirm(selectedIds);
      setSelectedIds([]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="modal-overlay admin-sub-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-asset-picker-title"
      onClick={onClose}
    >
      <div className="modal-content admin-add-photos-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="admin-add-photos-head">
          <h3 id="admin-asset-picker-title">{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Tancar" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="modal-muted admin-add-photos-sub">{subtitle}</p>
        <div className="admin-add-photos-toolbar">
          <input
            type="search"
            className="admin-add-photos-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cercar…"
            aria-label="Cercar fotos per nom o data"
          />
          <button type="button" className="btn btn-sm" onClick={selectAllVisible} disabled={filtered.length === 0}>
            Seleccionar totes les visibles
          </button>
          <button type="button" className="btn btn-sm" onClick={clearSelection} disabled={selectedIds.length === 0}>
            Netejar selecció
          </button>
        </div>
        <div className="admin-picker-scroll">
          {filtered.length ? (
            <div className="admin-picker-grid">
              {filtered.map((asset) => {
                const thumb = (asset.files.thumbUrl || asset.files.previewUrl || asset.files.originalUrl).trim();
                const sel = selectedIds.includes(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    aria-pressed={sel}
                    className={`admin-picker-tile${sel ? " admin-picker-tile--selected" : ""}`}
                    onClick={() => toggle(asset.id)}
                  >
                    <span className="admin-picker-tile-check" aria-hidden>
                      {sel ? "✓" : ""}
                    </span>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote storage image
                      <img src={thumb} alt="" className="admin-picker-tile-img" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="admin-picker-tile-placeholder">Sense miniatura</span>
                    )}
                    <span className="admin-picker-tile-title">{asset.title}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="modal-muted admin-picker-empty">{emptyMessage}</p>
          )}
        </div>
        <div className="admin-add-photos-footer">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Cancel·lar
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={selectedIds.length === 0 || busy}
            onClick={() => void handleConfirm()}
          >
            {busy ? "Afegint…" : `Afegir ${selectedIds.length} foto${selectedIds.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
