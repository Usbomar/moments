"use client";

import { useEffect, useRef } from "react";

type Props = {
  imageData: ImageData | null;
  width?: number;
  height?: number;
};

const BUCKETS = 48;

function buildChannelHistograms(data: ImageData): { r: number[]; g: number[]; b: number[] } {
  const hr = new Array<number>(BUCKETS).fill(0);
  const hg = new Array<number>(BUCKETS).fill(0);
  const hb = new Array<number>(BUCKETS).fill(0);
  const d = data.data;
  const step = Math.max(1, Math.floor(d.length / (4 * 120000)));
  for (let i = 0; i < d.length; i += 4 * step) {
    const r = d[i] ?? 0;
    const g = d[i + 1] ?? 0;
    const b = d[i + 2] ?? 0;
    hr[Math.min(BUCKETS - 1, Math.floor((r / 255) * BUCKETS))] += 1;
    hg[Math.min(BUCKETS - 1, Math.floor((g / 255) * BUCKETS))] += 1;
    hb[Math.min(BUCKETS - 1, Math.floor((b / 255) * BUCKETS))] += 1;
  }
  const peak = Math.max(1, ...hr, ...hg, ...hb);
  const norm = (arr: number[]) => arr.map((v) => v / peak);
  return { r: norm(hr), g: norm(hg), b: norm(hb) };
}

/**
 * Histograma RGB (només lectura): barres apil·lades per canal a cada bin d’intensitat.
 */
export function Histogram({ imageData, width = 200, height = 100 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const labelH = 14;
    const chartH = height - labelH;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "var(--bg-tertiary, #f3f4f6)";
    ctx.fillRect(0, 0, width, height);
    if (!imageData) {
      ctx.fillStyle = "var(--text-tertiary, #9ca3af)";
      ctx.font = "11px system-ui";
      ctx.fillText("Sense dades", 8, chartH / 2);
      return;
    }
    const { r, g, b } = buildChannelHistograms(imageData);
    const barW = width / BUCKETS;
    const zoneW = width / 3;
    ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
    ctx.fillRect(0, 0, zoneW, chartH);
    ctx.fillRect(zoneW, 0, zoneW, chartH);
    ctx.fillRect(zoneW * 2, 0, width - zoneW * 2, chartH);

    for (let i = 0; i < BUCKETS; i += 1) {
      const x = i * barW;
      const br = r[i] ?? 0;
      const gv = g[i] ?? 0;
      const bb = b[i] ?? 0;
      const stack = br + gv + bb;
      const totalH = stack * (chartH - 4);
      let y = chartH;
      if (totalH > 0) {
        const hB = (bb / stack) * totalH;
        const hG = (gv / stack) * totalH;
        const hR = (br / stack) * totalH;
        y -= hB;
        ctx.fillStyle = "rgba(37, 99, 235, 0.85)";
        ctx.fillRect(x, y, Math.max(1, barW - 0.4), hB);
        y -= hG;
        ctx.fillStyle = "rgba(22, 163, 74, 0.85)";
        ctx.fillRect(x, y, Math.max(1, barW - 0.4), hG);
        y -= hR;
        ctx.fillStyle = "rgba(220, 38, 38, 0.85)";
        ctx.fillRect(x, y, Math.max(1, barW - 0.4), hR);
      }
    }
    ctx.fillStyle = "var(--text-tertiary, #9ca3af)";
    ctx.font = "10px system-ui";
    ctx.fillText("Ombres", 4, height - 3);
    ctx.fillText("Migtons", width / 2 - 22, height - 3);
    ctx.fillText("Llums", width - 40, height - 3);
  }, [imageData, width, height]);

  return (
    <div className="histogram-root" role="img" aria-label="Histograma de distribució RGB (ombres, migtons i llums)">
      <canvas ref={canvasRef} width={width} height={height} />
    </div>
  );
}
