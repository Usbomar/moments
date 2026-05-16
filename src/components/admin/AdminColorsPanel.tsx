"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import { hexEquals, normalizeHex } from "@/lib/color-utils";
import {
  buildPaletteRows,
  loadStoredPalette,
  newCustomColorId,
  saveStoredPalette,
  type PaletteRow,
  type StoredPalette
} from "@/lib/admin-color-palette";

type Props = {
  assets: Asset[];
  palette: StoredPalette;
  onPaletteChange: (next: StoredPalette) => void;
  onClearPhotosWithHex: (hex: string) => Promise<void>;
  onMigratePhotosHex?: (fromHex: string, toHex: string) => Promise<void>;
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

export function AdminColorsPanel({
  assets,
  palette,
  onPaletteChange,
  onClearPhotosWithHex,
  onMigratePhotosHex
}: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newColorHex, setNewColorHex] = useState("#4466ff");
  const [newColorName, setNewColorName] = useState("");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingHex, setEditingHex] = useState("#4466ff");
  const [pickerHex, setPickerHex] = useState("#808080");
  const swatchPickerTargetRef = useRef<PaletteRow | null>(null);
  const swatchPickerInputRef = useRef<HTMLInputElement>(null);
  const editingRowIdRef = useRef<string | null>(null);
  editingRowIdRef.current = editingRowId;
  const editingHexRef = useRef(editingHex);
  editingHexRef.current = editingHex;
  const deferColorPickRef = useRef(false);

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
    const hex = normalizeHex(newColorHex);
    if (!hex) {
      setError("Color no vàlid. Tria un color amb el selector.");
      return;
    }
    if (palette.custom.some((c) => hexEquals(c.hex, hex))) {
      setError("Ja existeix aquest color a la paleta.");
      return;
    }
    const label = newColorName.trim() || `Personalitzat ${palette.custom.length + 1}`;
    const next: StoredPalette = {
      ...palette,
      custom: [...palette.custom, { id: newCustomColorId(), label, hex }]
    };
    setNewColorName("");
    void persist(next, `Color «${label}» afegit.`).catch(() => undefined);
  };

  const startEdit = (row: PaletteRow) => {
    setError(null);
    setEditingRowId(row.rowId);
    setEditingName(row.label);
    setEditingHex(normalizeHex(row.hex) ?? "#808080");
  };

  const commitEdit = async () => {
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
    const newHex = normalizeHex(editingHex);
    if (!newHex) {
      setError("Color no vàlid.");
      return;
    }
    const oldHex = normalizeHex(row.hex)!;

    let next: StoredPalette;

    if (row.kind === "preset") {
      if (hexEquals(newHex, oldHex)) {
        next = { ...palette, presetLabels: { ...palette.presetLabels, [oldHex]: name } };
      } else {
        if (palette.custom.some((c) => hexEquals(c.hex, newHex))) {
          setError("Ja hi ha un color personalitzat amb aquest codi.");
          return;
        }
        const hidden = new Set(palette.hiddenPresetHexes.map((h) => normalizeHex(h)).filter(Boolean) as string[]);
        hidden.add(oldHex);
        const pl = { ...palette.presetLabels };
        delete pl[oldHex];
        next = {
          ...palette,
          hiddenPresetHexes: [...hidden],
          presetLabels: pl,
          custom: [...palette.custom, { id: newCustomColorId(), label: name, hex: newHex }]
        };
      }
    } else if (row.kind === "custom" && row.customId) {
      if (palette.custom.some((c) => c.id !== row.customId && hexEquals(c.hex, newHex))) {
        setError("Ja existeix un color personalitzat amb aquest codi.");
        return;
      }
      try {
        if (!hexEquals(newHex, oldHex) && onMigratePhotosHex) await onMigratePhotosHex(oldHex, newHex);
      } catch {
        setError("No s’han pogut actualitzar les fotos amb el nou color.");
        return;
      }
      next = {
        ...palette,
        custom: palette.custom.map((c) => (c.id === row.customId ? { ...c, label: name, hex: newHex } : c))
      };
    } else if (row.kind === "in_use") {
      if (palette.custom.some((c) => hexEquals(c.hex, newHex))) {
        setError("Ja hi ha un color amb aquest codi a la paleta.");
        return;
      }
      next = {
        ...palette,
        custom: [...palette.custom, { id: newCustomColorId(), label: name, hex: newHex }]
      };
    } else {
      return;
    }

    setEditingRowId(null);
    await persist(next, "Color actualitzat.").catch(() => undefined);
  };

  const removeRow = async (row: PaletteRow) => {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      await onClearPhotosWithHex(row.hex);
      let next = palette;
      const hex = normalizeHex(row.hex)!;
      if (row.kind === "preset") {
        const hidden = new Set(palette.hiddenPresetHexes.map((h) => normalizeHex(h)).filter(Boolean) as string[]);
        hidden.add(hex);
        const pl = { ...palette.presetLabels };
        delete pl[hex];
        next = {
          ...palette,
          hiddenPresetHexes: [...hidden],
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
    const hex = normalizeHex(row.hex);
    if (!hex) return;
    const next: StoredPalette = {
      ...palette,
      custom: [...palette.custom, { id: newCustomColorId(), label: row.label, hex }]
    };
    void persist(next, "Color afegit a la paleta.").catch(() => undefined);
  };

  const openSwatchPicker = useCallback((row: PaletteRow) => {
    setError(null);
    swatchPickerTargetRef.current = row;
    const editingThisRow = editingRowIdRef.current === row.rowId;
    deferColorPickRef.current = editingThisRow;
    setPickerHex(editingThisRow ? editingHexRef.current : normalizeHex(row.hex) ?? "#808080");
    queueMicrotask(() => {
      const el = swatchPickerInputRef.current;
      if (!el) return;
      try {
        el.showPicker?.();
      } catch {
        el.click();
      }
    });
  }, []);

  const applyColorFromPicker = useCallback(
    async (row: PaletteRow, newHexRaw: string) => {
      const newHex = normalizeHex(newHexRaw);
      if (!newHex) {
        setError("Color no vàlid.");
        return;
      }
      const oldHex = normalizeHex(row.hex)!;
      if (hexEquals(newHex, oldHex)) return;

      setError(null);
      setStatus(null);

      if (row.kind === "custom" && row.customId) {
        if (palette.custom.some((c) => c.id !== row.customId && hexEquals(c.hex, newHex))) {
          setError("Ja existeix un color personalitzat amb aquest codi.");
          return;
        }
        try {
          if (onMigratePhotosHex) await onMigratePhotosHex(oldHex, newHex);
          const next: StoredPalette = {
            ...palette,
            custom: palette.custom.map((c) => (c.id === row.customId ? { ...c, hex: newHex } : c))
          };
          await persist(next, "Color actualitzat.");
        } catch {
          /* persist ja ha posat error */
        }
        return;
      }

      if (row.kind === "preset") {
        if (palette.custom.some((c) => hexEquals(c.hex, newHex))) {
          setError("Ja hi ha un color personalitzat amb aquest codi.");
          return;
        }
        const hidden = new Set(palette.hiddenPresetHexes.map((h) => normalizeHex(h)).filter(Boolean) as string[]);
        hidden.add(oldHex);
        const pl = { ...palette.presetLabels };
        delete pl[oldHex];
        const next: StoredPalette = {
          ...palette,
          hiddenPresetHexes: [...hidden],
          presetLabels: pl,
          custom: [...palette.custom, { id: newCustomColorId(), label: row.label, hex: newHex }]
        };
        setEditingRowId(null);
        await persist(next, "Color actualitzat (base convertit a personalitzat).").catch(() => undefined);
        return;
      }

      if (row.kind === "in_use") {
        if (palette.custom.some((c) => hexEquals(c.hex, newHex))) {
          setError("Ja hi ha un color amb aquest codi a la paleta.");
          return;
        }
        const next: StoredPalette = {
          ...palette,
          custom: [...palette.custom, { id: newCustomColorId(), label: row.label, hex: newHex }]
        };
        setEditingRowId(null);
        await persist(next, "Color afegit a la paleta.").catch(() => undefined);
      }
    },
    [palette, persist, onMigratePhotosHex]
  );

  const onSwatchPickerChange = useCallback(
    (hex: string) => {
      const row = swatchPickerTargetRef.current;
      const defer = deferColorPickRef.current;
      swatchPickerTargetRef.current = null;
      deferColorPickRef.current = false;
      if (!row) return;
      const normalized = normalizeHex(hex);
      if (!normalized) {
        setError("Color no vàlid.");
        return;
      }
      if (defer) {
        setEditingHex(normalized);
        setPickerHex(normalized);
        setError(null);
        return;
      }
      void applyColorFromPicker(row, normalized);
    },
    [applyColorFromPicker]
  );

  const swatchStyle = (hex: string) => {
    const h = normalizeHex(hex) ?? "#808080";
    return {
      backgroundColor: h,
      border: h === "#fafafa" || h === "#ffffff" ? "1px solid var(--border-dark)" : undefined
    } as const;
  };

  const renderRow = (row: PaletteRow) => (
    <tr key={row.rowId}>
      <td className="admin-colors-swatch-cell">
        <button
          type="button"
          className="admin-colors-swatch-btn"
          style={swatchStyle(row.hex)}
          aria-label={`Obrir selector de color: ${row.label}`}
          title="Canviar color"
          disabled={busy}
          onClick={() => openSwatchPicker(row)}
        />
      </td>
      <td>
        {editingRowId === row.rowId ? (
          <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus disabled={busy} />
        ) : (
          row.label
        )}
      </td>
      <td>{row.kind === "preset" ? "Base" : row.kind === "custom" ? "Personalitzat" : "Només en fotos"}</td>
      <td>
        <code>{row.hex}</code>
      </td>
      <td>{row.photoCount}</td>
      <td className="admin-color-actions">
        {editingRowId === row.rowId ? (
          <>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void commitEdit()}>
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
        Cada color és un codi <strong>#RRGGBB</strong> (negre, blanc, gris, qualsevol to). Clica el quadrat <strong>Mostra</strong> o
        el selector de color per triar el valor exacte. Les fotos desen <code>color_hex</code> a Supabase: cal haver executat la
        migració <code>20260516120000_assets_color_hex.sql</code> al projecte.
      </p>

      <input
        ref={swatchPickerInputRef}
        type="color"
        className="admin-colors-picker-hidden"
        aria-hidden
        tabIndex={-1}
        value={pickerHex}
        onChange={(e) => {
          const v = e.target.value;
          setPickerHex(v);
          onSwatchPickerChange(v);
        }}
      />

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
            <th>Codi</th>
            <th>Fotos</th>
            <th>Accions</th>
          </tr>
        </thead>
        <tbody>
          {mainRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="modal-muted">
                No hi ha colors a la paleta. Afegeix-ne un de personalitzat.
              </td>
            </tr>
          ) : (
            mainRows.map(renderRow)
          )}
        </tbody>
      </table>

      {inUseRows.length > 0 ? (
        <>
          <h3 className="admin-colors-section-title">Colors en fotos sense entrada a la paleta ({inUseRows.length})</h3>
          <table className="admin-stats-table admin-colors-table">
            <thead>
              <tr>
                <th>Mostra</th>
                <th>Nom</th>
                <th>Tipus</th>
                <th>Codi</th>
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