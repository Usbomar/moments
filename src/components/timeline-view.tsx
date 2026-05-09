"use client";

import { groupByMonth } from "@/lib/grouping";
import type { Asset } from "@/lib/types";
import { LibraryGrid } from "@/components/library-grid";

interface Props {
  items: Asset[];
  onOpenViewer?: (asset: Asset, contextItems: Asset[]) => void;
  onOpenModal?: (asset: Asset) => void;
}

export function TimelineView({ items, onOpenModal, onOpenViewer }: Props) {
  const groups = groupByMonth(items);
  const months = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const toLabel = (month: string) => {
    const [year, mm] = month.split("-");
    const date = new Date(Number(year), Number(mm) - 1, 1);
    if (Number.isNaN(date.getTime())) return month;
    return date.toLocaleDateString("ca-ES", { month: "long", year: "numeric" });
  };
  return (
    <>
      {months.map((month) => (
        <section className="timeline-group" key={month}>
          <h3>{toLabel(month)}</h3>
          <LibraryGrid items={groups[month]} onOpenModal={onOpenModal} onOpenViewer={onOpenViewer} />
        </section>
      ))}
    </>
  );
}
