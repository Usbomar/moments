"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Asset } from "@/lib/types";
import { buildTimelineClusters } from "@/lib/slider-timeline-layout";

export type SliderTimelineProps = {
  items: Asset[];
  orderedIndices: number[];
  currentIndex: number;
  onJumpToIndex: (index: number) => void;
};

export function SliderTimeline({ items, orderedIndices, currentIndex, onJumpToIndex }: SliderTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const clusters = useMemo(() => buildTimelineClusters(items, orderedIndices), [items, orderedIndices]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const active = track.querySelector(".slider-timeline__dot.is-active");
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentIndex]);

  if (orderedIndices.length < 2) return null;

  return (
    <div className="slider-timeline" aria-label="Timeline de fotos">
      <div ref={trackRef} className="slider-timeline__track">
        {clusters.map((cluster) => (
          <div key={cluster.dayKey} className="slider-timeline__cluster">
            <span className="slider-timeline__cluster-label">{cluster.dayLabel}</span>
            <div className="slider-timeline__cluster-dots" role="group" aria-label={cluster.dayLabel}>
              {cluster.indices.map((idx) => {
                const asset = items[idx];
                if (!asset) return null;
                const pos = orderedIndices.indexOf(idx) + 1;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`slider-timeline__dot${idx === currentIndex ? " is-active" : ""}`}
                    aria-label={`Foto ${pos} de ${orderedIndices.length}, ${cluster.dayLabel}`}
                    aria-current={idx === currentIndex ? "true" : undefined}
                    onClick={() => onJumpToIndex(idx)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
