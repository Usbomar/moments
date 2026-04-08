import { groupByEventWindow } from "@/lib/grouping";
import type { Asset } from "@/lib/types";

export interface MemoryStory {
  id: string;
  title: string;
  assetIds: string[];
  transitionPreset: "gentle" | "cinematic";
}

export function buildMemoryStories(items: Asset[]): MemoryStory[] {
  const events = groupByEventWindow(items);
  return Object.entries(events).map(([title, assets], index) => ({
    id: `memory-${index + 1}`,
    title,
    assetIds: assets.map((asset) => asset.id),
    transitionPreset: index % 2 ? "cinematic" : "gentle"
  }));
}
