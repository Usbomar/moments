import type { Asset } from "@/lib/types";
import { calendarDayKey, getAssetDate } from "@/lib/slider-temporal-nav";

export type SliderTimelineCluster = {
  dayKey: string;
  dayLabel: string;
  indices: number[];
};

export function formatDayLabelCa(d: Date): string {
  return new Intl.DateTimeFormat("ca", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** Agrupa índexs ordenats per dia natural (per a la timeline). */
export function buildTimelineClusters(items: Asset[], orderedIndices: number[]): SliderTimelineCluster[] {
  const clusters: SliderTimelineCluster[] = [];
  let current: SliderTimelineCluster | null = null;

  for (const idx of orderedIndices) {
    const asset = items[idx];
    if (!asset) continue;
    const d = getAssetDate(asset);
    const key = d ? calendarDayKey(d) : `sense-data-${idx}`;
    const dayLabel = d ? formatDayLabelCa(d) : "Sense data";

    if (!current || current.dayKey !== key) {
      current = { dayKey: key, dayLabel, indices: [idx] };
      clusters.push(current);
    } else {
      current.indices.push(idx);
    }
  }

  return clusters;
}
