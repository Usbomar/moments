/**
 * Preview canvas pipeline (mateix ordre que el servidor Sharp).
 * Compartit entre ImageEditor legacy i ImageEditorV2.
 */

import type { EditOperation } from "@/lib/image-edit-ops";

/** Imatge original o canvas intermig (mateix pipeline que el servidor). */
export type CanvasPipelineSource = HTMLImageElement | HTMLCanvasElement;

function sourceDimensions(source: CanvasPipelineSource): { w: number; h: number } {
  if (source instanceof HTMLCanvasElement) {
    return { w: source.width, h: source.height };
  }
  return { w: source.naturalWidth, h: source.naturalHeight };
}

export function analyzeHistogram(imageData: ImageData): {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpen: number;
} {
  const d = imageData.data;
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  let satSum = 0;
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i] ?? 0;
    const g = d[i + 1] ?? 0;
    const b = d[i + 2] ?? 0;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += y;
    sum2 += y * y;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max > 0 ? (max - min) / max : 0;
    n += 1;
  }
  if (!n) return { brightness: 0, contrast: 0, saturation: 0, sharpen: 0 };
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  const avgSat = satSum / n;
  const adjustments = { brightness: 0, contrast: 0, saturation: 0, sharpen: 0 };
  if (mean < 85) adjustments.brightness = 20;
  else if (mean < 110) adjustments.brightness = 10;
  if (std < 32) adjustments.contrast = 12;
  else if (std < 45) adjustments.contrast = 6;
  if (avgSat < 0.22) adjustments.saturation = 8;
  if (std < 28) adjustments.sharpen = 25;
  return adjustments;
}

export function applyOperationsToCanvas(source: CanvasPipelineSource, ops: EditOperation[]): HTMLCanvasElement {
  let canvas = document.createElement("canvas");
  const dim = sourceDimensions(source);
  let w = dim.w;
  let h = dim.h;
  canvas.width = w;
  canvas.height = h;
  let ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");
  ctx.drawImage(source, 0, 0, w, h, 0, 0, w, h);

  for (const op of ops) {
    switch (op.type) {
      case "crop": {
        const cw = Math.max(1, Math.min(Math.round(op.width), w));
        const ch = Math.max(1, Math.min(Math.round(op.height), h));
        const sx = Math.max(0, Math.min(Math.round(op.x), w - 1));
        const sy = Math.max(0, Math.min(Math.round(op.y), h - 1));
        const next = document.createElement("canvas");
        next.width = cw;
        next.height = ch;
        const c2 = next.getContext("2d");
        if (!c2) throw new Error("Canvas 2D no disponible");
        c2.drawImage(canvas, sx, sy, cw, ch, 0, 0, cw, ch);
        canvas = next;
        ctx = c2;
        w = cw;
        h = ch;
        break;
      }
      case "rotate": {
        if (op.angle === 0) break;
        const swap = op.angle === 90 || op.angle === 270;
        const next = document.createElement("canvas");
        next.width = swap ? h : w;
        next.height = swap ? w : h;
        const c2 = next.getContext("2d");
        if (!c2) throw new Error("Canvas 2D no disponible");
        c2.translate(next.width / 2, next.height / 2);
        c2.rotate((op.angle * Math.PI) / 180);
        c2.drawImage(canvas, -w / 2, -h / 2);
        canvas = next;
        ctx = c2;
        w = next.width;
        h = next.height;
        break;
      }
      case "resize": {
        const tw = Math.max(1, Math.round(op.width));
        const th = Math.max(1, Math.round(op.height));
        let nw = tw;
        let nh = th;
        if (op.maintainAspect) {
          const scale = Math.min(tw / w, th / h);
          nw = Math.max(1, Math.round(w * scale));
          nh = Math.max(1, Math.round(h * scale));
        }
        const next = document.createElement("canvas");
        next.width = nw;
        next.height = nh;
        const c2 = next.getContext("2d");
        if (!c2) throw new Error("Canvas 2D no disponible");
        c2.imageSmoothingEnabled = true;
        c2.imageSmoothingQuality = "high";
        c2.drawImage(canvas, 0, 0, w, h, 0, 0, nw, nh);
        canvas = next;
        ctx = c2;
        w = nw;
        h = nh;
        break;
      }
      case "brightness": {
        const next = document.createElement("canvas");
        next.width = w;
        next.height = h;
        const c2 = next.getContext("2d");
        if (!c2) throw new Error("Canvas 2D no disponible");
        const pct = Math.max(5, 100 + op.value);
        c2.filter = `brightness(${pct}%)`;
        c2.drawImage(canvas, 0, 0);
        c2.filter = "none";
        canvas = next;
        ctx = c2;
        break;
      }
      case "contrast": {
        const next = document.createElement("canvas");
        next.width = w;
        next.height = h;
        const c2 = next.getContext("2d");
        if (!c2) throw new Error("Canvas 2D no disponible");
        const pct = Math.max(5, 100 + op.value);
        c2.filter = `contrast(${pct}%)`;
        c2.drawImage(canvas, 0, 0);
        c2.filter = "none";
        canvas = next;
        ctx = c2;
        break;
      }
      case "saturation": {
        const next = document.createElement("canvas");
        next.width = w;
        next.height = h;
        const c2 = next.getContext("2d");
        if (!c2) throw new Error("Canvas 2D no disponible");
        const pct = Math.max(0, 100 + op.value);
        c2.filter = `saturate(${pct}%)`;
        c2.drawImage(canvas, 0, 0);
        c2.filter = "none";
        canvas = next;
        ctx = c2;
        break;
      }
      case "blur": {
        const next = document.createElement("canvas");
        next.width = w;
        next.height = h;
        const c2 = next.getContext("2d");
        if (!c2) throw new Error("Canvas 2D no disponible");
        const px = Math.max(0, Math.min(20, op.value));
        c2.filter = px > 0 ? `blur(${px}px)` : "none";
        c2.drawImage(canvas, 0, 0);
        c2.filter = "none";
        canvas = next;
        ctx = c2;
        break;
      }
      case "sharpen": {
        const next = document.createElement("canvas");
        next.width = w;
        next.height = h;
        const c2 = next.getContext("2d");
        if (!c2) throw new Error("Canvas 2D no disponible");
        const bump = Math.min(8, Math.max(0, op.value / 25));
        c2.filter = bump > 0 ? `contrast(${100 + bump}%)` : "none";
        c2.drawImage(canvas, 0, 0);
        c2.filter = "none";
        canvas = next;
        ctx = c2;
        break;
      }
      case "adjustmentBatch": {
        const sub: EditOperation[] = [];
        if (op.brightness !== 0) sub.push({ type: "brightness", value: op.brightness });
        if (op.contrast !== 0) sub.push({ type: "contrast", value: op.contrast });
        if (op.saturation !== 0) sub.push({ type: "saturation", value: op.saturation });
        if (op.blur !== 0) sub.push({ type: "blur", value: op.blur });
        if (op.sharpen !== 0) sub.push({ type: "sharpen", value: op.sharpen });
        if (sub.length === 0) break;
        const merged = applyOperationsToCanvas(canvas, sub);
        canvas = merged;
        w = merged.width;
        h = merged.height;
        ctx = merged.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D no disponible");
        break;
      }
      case "autoEnhance": {
        let work = canvas;
        let sw = w;
        let sh = h;
        const te = op.targetMaxEdge != null && op.targetMaxEdge > 0 ? Math.round(op.targetMaxEdge) : 0;
        if (te >= 64 && Math.max(sw, sh) > te) {
          const scale = te / Math.max(sw, sh);
          const nw = Math.max(1, Math.round(sw * scale));
          const nh = Math.max(1, Math.round(sh * scale));
          const ds = document.createElement("canvas");
          ds.width = nw;
          ds.height = nh;
          const cd = ds.getContext("2d");
          if (!cd) throw new Error("Canvas 2D no disponible");
          cd.imageSmoothingEnabled = true;
          cd.imageSmoothingQuality = "high";
          cd.drawImage(work, 0, 0, sw, sh, 0, 0, nw, nh);
          work = ds;
          sw = nw;
          sh = nh;
        }
        const next = document.createElement("canvas");
        next.width = sw;
        next.height = sh;
        const c2 = next.getContext("2d");
        if (!c2) throw new Error("Canvas 2D no disponible");
        const b = Math.max(5, 100 + op.brightness);
        const c = Math.max(5, 100 + op.contrast);
        const s = Math.max(0, 100 + op.saturation);
        const shp = Math.min(6, op.sharpen / 20);
        c2.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)${shp > 0 ? ` contrast(${100 + shp}%)` : ""}`;
        c2.drawImage(work, 0, 0);
        c2.filter = "none";
        canvas = next;
        ctx = c2;
        w = sw;
        h = sh;
        break;
      }
      default:
        break;
    }
  }
  return canvas;
}
