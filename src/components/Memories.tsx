"use client";

import { useCallback, useMemo } from "react";
import type { Asset } from "@/lib/types";

export type MemoryCard = {
  id: string;
  title: string;
  description: string;
  assets: Asset[];
  preview: Asset | null;
};

interface Props {
  items: Asset[];
  onView: (assets: Asset[]) => void;
}

function sameMonthDay(a: Date, b: Date): boolean {
  return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildMemories(items: Asset[]): MemoryCard[] {
  if (!items.length) return [];
  const now = new Date();
  const out: MemoryCard[] = [];

  for (let yearsAgo = 1; yearsAgo <= 10; yearsAgo += 1) {
    const ref = new Date(now.getFullYear() - yearsAgo, now.getMonth(), now.getDate());
    const hits = items.filter((a) => {
      const d = new Date(a.takenAt);
      return !Number.isNaN(d.getTime()) && sameMonthDay(d, ref);
    });
    if (hits.length) {
      out.push({
        id: `on-this-day-${yearsAgo}`,
        title: `Avui fa ${yearsAgo} any${yearsAgo === 1 ? "" : "s"}`,
        description: `${hits.length} foto${hits.length === 1 ? "" : "s"} preses en aquesta data.`,
        assets: hits,
        preview: hits[0] ?? null
      });
    }
  }

  const byYear = new Map<number, Asset[]>();
  for (const a of items) {
    const d = new Date(a.takenAt);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(a);
  }
  const years = [...byYear.entries()].filter(([, arr]) => arr.length).sort((a, b) => b[0] - a[0]);
  for (const [year, arr] of years) {
    const sorted = [...arr].sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime());
    const top = sorted.slice(0, 20);
    if (top.length >= 3) {
      out.push({
        id: `best-${year}`,
        title: `Millors del ${year}`,
        description: `${top.length} fotos destacades d’aquest any.`,
        assets: top,
        preview: top[0] ?? null
      });
    }
  }

  const month = now.getMonth();
  const monthLabel = new Intl.DateTimeFormat("ca", { month: "long" }).format(new Date(2024, month, 1));
  const crossYear = items.filter((a) => {
    const d = new Date(a.takenAt);
    return !Number.isNaN(d.getTime()) && d.getMonth() === month && d.getFullYear() !== now.getFullYear();
  });
  if (crossYear.length >= 2) {
    const sorted = [...crossYear].sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime());
    out.push({
      id: `same-month-${month}`,
      title: `El mateix mes (${monthLabel})`,
      description: `${sorted.length} foto${sorted.length === 1 ? "" : "s"} d’altres anys en aquest mes.`,
      assets: sorted,
      preview: sorted[0] ?? null
    });
  }

  return out;
}

export function Memories({ items, onView }: Props) {
  const memories = useMemo(() => buildMemories(items), [items]);

  const handleView = useCallback(
    (m: MemoryCard) => {
      if (m.assets.length) onView(m.assets);
    },
    [onView]
  );

  if (!memories.length) {
    return <p className="modal-muted">Encara no hi ha records amb prou fotos. Puja més imatges amb dates variades.</p>;
  }

  return (
    <div className="memories-grid">
      {memories.map((m) => {
        const url = m.preview ? (m.preview.files.previewUrl || m.preview.files.originalUrl).trim() : "";
        return (
          <article key={m.id} className="memory-card">
            <div className="memory-card-visual">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" referrerPolicy="no-referrer" />
              ) : (
                <div className="memory-card-placeholder">—</div>
              )}
            </div>
            <div className="memory-card-body">
              <h3>{m.title}</h3>
              <p className="modal-muted">{m.description}</p>
              <button type="button" className="primary" onClick={() => handleView(m)}>
                Veure
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
