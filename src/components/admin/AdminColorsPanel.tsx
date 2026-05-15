"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import { hexToHue } from "@/components/admin/adminAssetHelpers";
import {
  buildPaletteRows,
  loadStoredPalette,
  newCustomColorId,
  normalizeHue,
  saveStoredPalette,
  type CustomColorDef,
  type PaletteRow,
  type StoredPalette
} from "@/lib/admin-color-palette";

type Props = {
  assets: Asset[];
  palette: StoredPalette;
  onPaletteChange: (next: StoredPalette) => void;
};

async function fetchPaletteFromServer(): Promise<{ palette: StoredPalette; schemaReady: boolean }> {
  const res = await fetch("/api/profile/color-palette", { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as {
    palette?: StoredPalette;
    schemaReady?: boolean;
    error?: string;
  };
  if (!res.ok) throw new Error(body.error ?? "No s'ha pogut carregar la paleta");
  return {
    palette: body.palette ?? { custom: [], presetLabels: {} },
    schemaReady: body.schemaReady !== false
  };
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

export function AdminColorsPanel({ assets, palette, onPaletteChange }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newColorHex, setNewColorHex] = useState("#4466ff");
  const [newColorName, setNewColorName] = useState("");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const customSectionRef = useRef<HTMLDivElement | null>(null);

  const { custom, presetLabels } = palette;

  const rows = useMemo(() => buildPaletteRows(assets, custom, presetLabels), [assets, custom, presetLabels]);
  const customRows = useMemo(() => rows.filter((r) => r.kind === "custom"), [rows]);
  const presetRows = useMemo(() => rows.filter((r) => r.kind === "preset"), [rows]);
  const inUseRows = useMemo(() => rows.filter((r) => r.kind === "in_use"), [rows]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const remote = await fetchPaletteFromServer();
        if (cancelled) return;
        if (remote.palette.custom.length || Object.keys(remote.palette.presetLabels).length) {
          onPaletteChange(remote.palette);
          saveStoredPalette(remote.palette);
        } else {
          const local = loadStoredPalette();
          if (local.custom.length || Object.keys(local.presetLabels).length) {
            onPaletteChange(local);
            try {
              await persistPaletteToServer(local);
            } catch {
              /* local fallback */
            }
          }
        }
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
    const label = newColorName.trim() || `Personalitzat ${custom.length + 1}`;
    const next: StoredPalette = {
      ...palette,
      custom: [...custom, { id: newCustomColorId(), label, hue: normalized }]
    };
    setNewColorName("");
    void persist(next, `Color «${label}» afegit (${normalized}°).`).then(() => {
      customSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const startEdit = (row: PaletteRow) => {
    setError(null);
    setEditingRowId(row.rowId);
    setEditingName(row.label);
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
      next = { ...palette, presetLabels: { ...presetLabels, [String(row.hue)]: name } };
    } else if (row.kind === "custom" && row.customId) {
      next = {
        ...palette,
        custom: custom.map((c) => (c.id === row.customId ? { ...c, label: name } : c))
      };
    } else if (row.kind === "in_use") {
      next = {
        ...palette,
        custom: [...custom, { id: newCustomColorId(), label: name, hue: row.hue }]
      };
    }
    setEditingRowId(null);
    void persist(next, "Nom actualitzat.");
  };

  const removeRow = (row: PaletteRow) => {
    let next = palette;
    if (row.kind === "preset") {
      const pl = { ...presetLabels };
      delete pl[String(row.hue)];
      next = { ...palette, presetLabels: pl };
    } else if (row.kind === "custom" && row.customId) {
      next = { ...palette, custom: custom.filter((c) => c.id !== row.customId) };
    } else return;
    if (editingRowId === row.rowId) setEditingRowId(null);
    void persist(next, row.kind === "preset" ? "Nom del preset restaurat." : "Color eliminat.");
  };

  const promoteInUse = (row: PaletteRow) => {
    if (row.kind !== "in_use") return;
    const next: StoredPalette = {
      ...palette,
      custom: [...custom, { id: newCustomColorId(), label: `To ${row.hue}°`, hue: row.hue }]
    };
    void persist(next, "Color afegit a la paleta.");
  };

  const renderRow = (row: PaletteRow) => (
    <tr key={row.rowId}>
      <td>
        <span className="admin-assets-color-chip" style={{ backgroundColor: `hsl(${row.hue} 72% 46%)` }} aria-hidden />
      </td>
      <td>
        {editingRowId === row.rowId ? (
          <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus />
        ) : (
          row.label
        )}
      </td>
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
            ) : null}
            {row.kind !== "in_use" ? (
              <button type="button" className="btn btn-sm danger" disabled={busy} onClick={() => removeRow(row)}>
                {row.kind === "preset" ? "Restaurar nom" : "Eliminar"}
              </button>
            ) : null}
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
        Els colors personalitzats es desen al teu compte (Supabase) i apareixen als desplegables de la pestanya Fotos.
        Tria un to que no coincideixi exactament amb un color base si vols una fila pròpia a «Personalitzats».
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
          placeholder="Nom del color (obligatori per trobar-lo al desplegable)"
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

      <div ref={customSectionRef} className="admin-colors-section">
        <h3 className="admin-colors-section-title">Personalitzats ({customRows.length})</h3>
        {customRows.length === 0 ? (
          <p className="modal-muted">Encara no has creat cap color personalitzat.</p>
        ) : (
          <table className="admin-stats-table">
            <thead>
              <tr>
                <th>Mostra</th>
                <th>Nom</th>
                <th>To</th>
                <th>Fotos</th>
                <th>Accions</th>
              </tr>
            </thead>
            <tbody>{customRows.map(renderRow)}</tbody>
          </table>
        )}
      </div>

      <details className="admin-colors-section" open={presetRows.length > 0}>
        <summary className="admin-colors-section-title">Colors base ({presetRows.length})</summary>
        <table className="admin-stats-table">
          <thead>
            <tr>
              <th>Mostra</th>
              <th>Nom</th>
              <th>To</th>
              <th>Fotos</th>
              <th>Accions</th>
            </tr>
          </thead>
          <tbody>{presetRows.map(renderRow)}</tbody>
        </table>
      </details>

      {inUseRows.length > 0 ? (
        <details className="admin-colors-section">
          <summary className="admin-colors-section-title">Només en fotos ({inUseRows.length})</summary>
          <table className="admin-stats-table">
            <thead>
              <tr>
                <th>Mostra</th>
                <th>Nom</th>
                <th>To</th>
                <th>Fotos</th>
                <th>Accions</th>
              </tr>
            </thead>
            <tbody>{inUseRows.map(renderRow)}</tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

