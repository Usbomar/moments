"use client";

import { useMemo, useState } from "react";
import type { Asset } from "@/lib/types";
import type { AppCollection } from "@/lib/collections";

type Props = {
  open: boolean;
  assets: Asset[];
  collections: AppCollection[];
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => Promise<void>;
  onMoveToCollection: (asset: Asset, collectionId: string) => Promise<void>;
};

type SortKey = "title" | "type" | "takenAt" | "uploadedAt" | "location" | "tags";
type SortState = { key: SortKey; dir: "asc" | "desc" };

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
}

export function AdminAssetManager({ open, assets, collections, onClose, onEdit, onDelete, onMoveToCollection }: Props) {
  const [sort, setSort] = useState<SortState>({ key: "takenAt", dir: "desc" });
  const [moveTargetById, setMoveTargetById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const list = [...assets];
    const get = (a: Asset): string => {
      if (sort.key === "title") return a.title ?? "";
      if (sort.key === "type") return a.type ?? "";
      if (sort.key === "takenAt") return a.takenAt ?? "";
      if (sort.key === "uploadedAt") return a.uploadedAt ?? "";
      if (sort.key === "location") return `${a.location?.city ?? ""}, ${a.location?.country ?? ""}`;
      return (a.tags ?? []).join(", ");
    };
    list.sort((a, b) => {
      const res = cmpText(get(a), get(b));
      return sort.dir === "asc" ? res : -res;
    });
    return list;
  }, [assets, sort]);

  if (!open) return null;

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  return (
    <div className="modal-overlay modal-overlay--front" role="dialog" aria-modal="true" aria-label="Administrador de fotos" onClick={onClose}>
      <div className="modal-content admin-assets-modal" onClick={(e) => e.stopPropagation()}>
        <header className="admin-assets-head">
          <h2>Administrador de fotos</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="admin-assets-table-wrap">
          <table className="admin-assets-table">
            <thead>
              <tr>
                <th><button type="button" onClick={() => toggleSort("title")}>Título</button></th>
                <th><button type="button" onClick={() => toggleSort("type")}>Tipo</button></th>
                <th><button type="button" onClick={() => toggleSort("takenAt")}>Fecha</button></th>
                <th><button type="button" onClick={() => toggleSort("location")}>Ubicación</button></th>
                <th><button type="button" onClick={() => toggleSort("tags")}>Tags</button></th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>{a.type}</td>
                  <td>{new Date(a.takenAt).toLocaleDateString()}</td>
                  <td>{a.location ? `${a.location.city}, ${a.location.country}` : "—"}</td>
                  <td className="admin-assets-tags">{a.tags.length ? a.tags.map((t) => `#${t}`).join(" ") : "—"}</td>
                  <td>
                    <div className="admin-assets-actions">
                      <button type="button" className="btn btn-sm" onClick={() => onEdit(a)}>Editar</button>
                      <button
                        type="button"
                        className="btn btn-sm danger"
                        disabled={busyId === a.id}
                        onClick={async () => {
                          if (!confirm(`¿Eliminar "${a.title}"? Esta acción no se puede deshacer.`)) return;
                          setBusyId(a.id);
                          try {
                            await onDelete(a);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        Borrar
                      </button>
                      <select
                        value={moveTargetById[a.id] ?? ""}
                        onChange={(e) => setMoveTargetById((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        aria-label={`Mover ${a.title} a colección`}
                      >
                        <option value="">Mover a…</option>
                        {collections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!moveTargetById[a.id] || busyId === a.id}
                        onClick={async () => {
                          const target = moveTargetById[a.id];
                          if (!target) return;
                          setBusyId(a.id);
                          try {
                            await onMoveToCollection(a, target);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        Mover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

