"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Asset } from "@/lib/types";
import { hexToHue } from "@/components/admin/adminAssetHelpers";
import {
  buildPaletteRows,
  loadStoredPalette,
  newCustomColorId,
  normalizeHue,
  saveStoredPalette,
  type PaletteRow,
  type StoredPalette
} from "@/lib/admin-color-palette";

type Props = {
  assets: Asset[];
  palette: StoredPalette;
  onPaletteChange: (next: StoredPalette) => void;
  onClearPhotosWithHue: (hue: number) => Promise<void>;
};

async function fetchPaletteFromServer(): Promise<StoredPalette> {
  const res = await fetch("/api/profile/color-palette", { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as {
    palette?: StoredPalette;
    schemaReady?: boolean;
    error?: string;
  };
  if (!res.ok) throw new Error(body.error ?? "No s'ha pogut carregar la paleta");
  return body.palette ?? loadStoredPalette();
}

async function persistPaletteToServer(palette: StoredPalette): Promise<void> {
  const res = await fetch("/api/profile/color-palette", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(palette)
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? "No s'ha pogut desar la paleta");
}

export function AdminColorsPanel({ assets, palette, onPaletteChange, onClearPhotosWithHue }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newColorHex, setNewColorHex] = useState("#4466ff");
  const [newColorName, setNewColorName] = useState("");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingHueHex, setEditingHueHex] = useState("#4466ff");

  const rows = useMemo(() => buildPaletteRows(assets, palette), [assets, palette]);
  const mainRows = useMemo(() => rows.filter((r) => r.kind !== "in_use"), [rows]);
  const inUseRows = useMemo(() => rows.filter((r) => r.kind === "in_use"), [rows]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const remote = await fetchPaletteFromServer();
        if (cancelled) return;
        onPaletteChange(remote);
        saveStoredPalette(remote);
      } catch {
        if (!cancelled) onPaletteChange(loadStoredPalette());
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onPaletteChange]);

  const persist = useCallback(
    async (next: StoredPalette, successMessage?: string) => {
      setError(null);
      setBusy(true);
      onPaletteChange(next);
      saveStoredPalette(next);
      try {
        await persistPaletteToServer(next);
        if (successMessage) setStatus(successMessage);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error en desar";
        setError(msg);
        setStatus(null);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [onPaletteChange]
  );

  const handleAdd = () => {
    setError(null);
    setStatus(null);
    const hue = hexToHue(newColorHex);
    if (hue === null) {
      setError("Color no vàlid. Tria un color amb el selector.");
      return;
    }
    const normalized = normalizeHue(hue);
    const label = newColorName.trim() || `Personalitzat ${palette.custom.length + 1}`;
    const next: StoredPalette = {
      ...palette,
      custom: [...palette.custom, { id: newCustomColorId(), label, hue: normalized }]
    };
    setNewColorName("");
    void persist(next, `Color «${label}» afegit.`).catch(() => undefined);
  };

  const startEdit = (row: PaletteRow) => {
    setError(null);
    setEditingRowId(row.rowId);
    setEditingName(row.label);
    setEditingHueHex(hueToHex(row.hue));
  };

  const commitEdit = () => {
    if (!editingRowId) return;
    const name = editingName.trim();
    if (!name) {
      setError("El nom no pot estar buit.");
      return;
    }
    const row = rows.find((r) => r.rowId === editingRowId);
    if (!row) {
      setEditingRowId(null);
      return;
    }
    let next = palette;
    if (row.kind === "preset") {
      next = { ...palette, presetLabels: { ...palette.presetLabels, [String(row.hue)]: name } };
    } else if (row.kind === "custom" && row.customId) {
      const hue = hexToHue(editingHueHex);
      if (hue === null) {
        setError("Color no vàlid.");
        return;
      }
      next = {
        ...palette,
        custom: palette.custom.map((c) =>
          c.id === row.customId ? { ...c, label: name, hue: normalizeHue(hue) } : c
        )
      };
    } else if (row.kind === "in_use") {
      const hue = hexToHue(editingHueHex);
      if (hue === null) {
        setError("Color no vàlid.");
        return;
      }
      next = {
        ...palette,
        custom: [...palette.custom, { id: newCustomColorId(), label: name, hue: normalizeHue(hue) }]
      };
    }
    setEditingRowId(null);
    void persist(next, "Color actualitzat.").catch(() => undefined);
  };

  const removeRow = async (row: PaletteRow) => {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      await onClearPhotosWithHue(row.hue);
      let next = palette;
      if (row.kind === "preset") {
        const hidden = new Set(palette.hiddenPresetHues.map(normalizeHue));
        hidden.add(normalizeHue(row.hue));
        const pl = { ...palette.presetLabels };
        delete pl[String(row.hue)];
        next = {
          ...palette,
          hiddenPresetHues: [...hidden],
          presetLabels: pl
        };
      } else if (row.kind === "custom" && row.customId) {
        next = { ...palette, custom: palette.custom.filter((c) => c.id !== row.customId) };
      } else return;
      if (editingRowId === row.rowId) setEditingRowId(null);
      await persist(next, "Color eliminat. Les fotos afectades ja no tenen color assignat.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No s'ha pogut eliminar el color");
    } finally {
      setBusy(false);
    }
  };

  const promoteInUse = (row: PaletteRow) => {
    if (row.kind !== "in_use") return;
    const next: StoredPalette = {
      ...palette,
      custom: [...palette.custom, { id: newCustomColorId(), label: `To ${row.hue}°`, hue: row.hue }]
    };
    void persist(next, "Color afegit a la paleta.").catch(() => undefined);
  };

  const renderRow = (row: PaletteRow) => (
    <tr key={row.rowId}>
      <td className="admin-colors-swatch-cell">
        {editingRowId === row.rowId && row.kind === "custom" ? (
          <input
            type="color"
            value={editingHueHex}
            disabled={busy}
            onChange={(e) => setEditingHueHex(e.target.value)}
            aria-label="Canvia el to"
            className="admin-colors-edit-swatch"
          />
        ) : (
          <span className="admin-assets-color-chip" style={{ backgroundColor: `hsl(${row.hue} 72% 46%)` }} aria-hidden />
        )}
      </td>
      <td>
        {editingRowId === row.rowId ? (
          <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus disabled={busy} />
        ) : (
          row.label
        )}
      </td>
      <td>{row.kind === "preset" ? "Base" : row.kind === "custom" ? "Personalitzat" : "Només en fotos"}</td>
      <td>{row.hue}°</td>
      <td>{row.photoCount}</td>
      <td className="admin-color-actions">
        {editingRowId === row.rowId ? (
          <>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={commitEdit}>
              Desar
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setEditingRowId(null)}>
              Cancel·lar
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => startEdit(row)}>
              Editar
            </button>
            {row.kind === "in_use" ? (
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => promoteInUse(row)}>
                Afegir a paleta
              </button>
            ) : (
              <button type="button" className="btn btn-sm danger" disabled={busy} onClick={() => void removeRow(row)}>
                Eliminar
              </button>
            )}
          </>
        )}
      </td>
    </tr>
  );

  if (!hydrated) {
    return <p className="modal-muted">Carregant paleta de colors…</p>;
  }

  return (
    <div className="admin-colors-panel">
      <p className="modal-muted admin-colors-intro">
        Gestiona els 20 colors base (pots eliminar els que no vulguis) i afegeix personalitzats. El mateix llistat apareix als
        desplegables de Configuració → Fotos i a l&apos;editor de dades de cada foto. En eliminar un color, les fotos que el tenien
        passen a «Sense color».
      </p>

      <div className="admin-assets-custom-color">
        <input
          type="color"
          value={newColorHex}
          disabled={busy}
          onChange={(e) => setNewColorHex(e.target.value)}
          aria-label="Escull color personalitzat"
        />
        <input
          type="text"
          value={newColorName}
          disabled={busy}
          onChange={(e) => setNewColorName(e.target.value)}
          placeholder="Nom del color"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <button type="button" className="btn btn-sm" disabled={busy} onClick={handleAdd}>
          {busy ? "Desant…" : "Afegir color"}
        </button>
      </div>

      {status ? (
        <p className="admin-color-form-success" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="admin-color-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <table className="admin-stats-table admin-colors-table">
        <thead>
          <tr>
            <th>Mostra</th>
            <th>Nom</th>
            <th>Tipus</th>
            <th>To</th>
            <th>Fotos</th>
            <th>Accions</th>
          </tr>
        </thead>
        <tbody>
          {mainRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="modal-muted">
                No hi ha colors a la paleta. Afegeix-ne un de personalitzat o restaura colors base eliminats des de Supabase.
              </td>
            </tr>
          ) : (
            mainRows.map(renderRow)
          )}
        </tbody>
      </table>

      {inUseRows.length > 0 ? (
        <>
          <h3 className="admin-colors-section-title">Tons en fotos sense entrada a la paleta ({inUseRows.length})</h3>
          <table className="admin-stats-table admin-colors-table">
            <thead>
              <tr>
                <th>Mostra</th>
                <th>Nom</th>
                <th>Tipus</th>
                <th>To</th>
                <th>Fotos</th>
                <th>Accions</th>
              </tr>
            </thead>
            <tbody>{inUseRows.map(renderRow)}</tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}

function hueToHex(hue: number): string {
  const h = normalizeHue(hue) / 360;
  const s = 0.72;
  const l = 0.46;
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
