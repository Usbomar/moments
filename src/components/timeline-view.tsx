"use client";

import { groupByMonth } from "@/lib/grouping";
import type { Asset } from "@/lib/types";
import { LibraryGrid } from "@/components/library-grid";

interface Props {
  items: Asset[];
  onOpenViewer?: (asset: Asset) => void;
  onOpenModal?: (asset: Asset) => void;
}

export function TimelineView({ items, onOpenModal, onOpenViewer }: Props) {
  const groups = groupByMonth(items);
  const months = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  return (
    <>
      {months.map((month) => (
        <section className="timeline-group" key={month}>
          <h3>{month}</h3>
          <LibraryGrid items={groups[month]} onOpenModal={onOpenModal} onOpenViewer={onOpenViewer} />
        </section>
      ))}
    </>
  );
}
