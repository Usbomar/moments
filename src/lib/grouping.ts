import type { Asset } from "@/lib/types";

export function groupByMonth(input: Asset[]): Record<string, Asset[]> {
  return input.reduce<Record<string, Asset[]>>((acc, asset) => {
    const month = asset.takenAt.slice(0, 7);
    acc[month] ??= [];
    acc[month].push(asset);
    return acc;
  }, {});
}

export function groupByEventWindow(input: Asset[]): Record<string, Asset[]> {
  const sorted = [...input].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const out: Record<string, Asset[]> = {};
  let eventIndex = 1;
  let cursor: Asset[] = [];
  for (const asset of sorted) {
    const last = cursor[cursor.length - 1];
    if (!last) {
      cursor.push(asset);
      continue;
    }
    const delta = Math.abs(new Date(asset.takenAt).getTime() - new Date(last.takenAt).getTime());
    if (delta > 1000 * 60 * 60 * 36) {
      out[`Event ${eventIndex}`] = cursor;
      eventIndex += 1;
      cursor = [asset];
    } else {
      cursor.push(asset);
    }
  }
  if (cursor.length) out[`Event ${eventIndex}`] = cursor;
  return out;
}
