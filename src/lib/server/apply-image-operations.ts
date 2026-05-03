import sharp from "sharp";
import type { EditOperation } from "@/lib/image-edit-ops";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Apply edit operations in order (same contract as client canvas preview).
 */
export async function applyImageOperationsToBuffer(input: Buffer, operations: EditOperation[]): Promise<Buffer> {
  let pipeline = sharp(input, { failOn: "none" });

  for (const op of operations) {
    switch (op.type) {
      case "crop": {
        const meta = await pipeline.metadata();
        const mw = meta.width ?? 0;
        const mh = meta.height ?? 0;
        const left = clamp(Math.round(op.x), 0, Math.max(0, mw - 1));
        const top = clamp(Math.round(op.y), 0, Math.max(0, mh - 1));
        const width = clamp(Math.round(op.width), 1, Math.max(1, mw - left));
        const height = clamp(Math.round(op.height), 1, Math.max(1, mh - top));
        pipeline = pipeline.extract({ left, top, width, height });
        break;
      }
      case "rotate": {
        if (op.angle !== 0) {
          /* Canvas preview uses clockwise degrees; Sharp rotates counter-clockwise. */
          pipeline = pipeline.rotate(-op.angle);
        }
        break;
      }
      case "resize": {
        const meta = await pipeline.metadata();
        const cw = meta.width ?? 1;
        const ch = meta.height ?? 1;
        const tw = Math.max(1, Math.round(op.width));
        const th = Math.max(1, Math.round(op.height));
        let nw = tw;
        let nh = th;
        if (op.maintainAspect) {
          const scale = Math.min(tw / cw, th / ch);
          nw = Math.max(1, Math.round(cw * scale));
          nh = Math.max(1, Math.round(ch * scale));
          pipeline = pipeline.resize({ width: nw, height: nh, fit: "inside", withoutEnlargement: false });
        } else {
          pipeline = pipeline.resize({ width: nw, height: nh, fit: "fill", position: "centre" });
        }
        break;
      }
      case "brightness": {
        const b = clamp(1 + op.value / 100, 0.2, 2.5);
        pipeline = pipeline.modulate({ brightness: b });
        break;
      }
      case "saturation": {
        const s = clamp(1 + op.value / 100, 0, 3);
        pipeline = pipeline.modulate({ saturation: s });
        break;
      }
      case "contrast": {
        const c = clamp(op.value / 100, -0.95, 0.95);
        const a = 1 + c;
        const b = 128 * (1 - a);
        pipeline = pipeline.linear(a, b);
        break;
      }
      case "blur": {
        const sigma = clamp(op.value / 3, 0, 6.5);
        if (sigma > 0.01) {
          pipeline = pipeline.blur(sigma);
        }
        break;
      }
      case "sharpen": {
        const sigma = clamp(op.value / 80, 0, 3);
        if (sigma > 0.01) {
          pipeline = pipeline.sharpen({ sigma, m1: 1, m2: 2, x1: 2, y2: 10, y3: 20 });
        }
        break;
      }
      case "autoEnhance": {
        const meta = await pipeline.metadata();
        const mw = meta.width ?? 0;
        const mh = meta.height ?? 0;
        const edge = op.targetMaxEdge != null && op.targetMaxEdge > 0 ? Math.round(op.targetMaxEdge) : 0;
        if (edge >= 64 && mw > 0 && mh > 0 && Math.max(mw, mh) > edge) {
          pipeline = pipeline.resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true });
        }
        const b = clamp(1 + op.brightness / 100, 0.2, 2.5);
        const s = clamp(1 + op.saturation / 100, 0, 3);
        const c = clamp(op.contrast / 100, -0.95, 0.95);
        const a = 1 + c;
        const off = 128 * (1 - a);
        const sh = clamp(op.sharpen / 80, 0, 3);
        pipeline = pipeline.modulate({ brightness: b, saturation: s }).linear(a, off);
        if (sh > 0.01) {
          pipeline = pipeline.sharpen({ sigma: sh, m1: 1, m2: 2, x1: 2, y2: 10, y3: 20 });
        }
        break;
      }
      default:
        break;
    }
  }

  return pipeline.toBuffer();
}

export async function makePreviewWebp(buffer: Buffer, maxEdge: number, quality: number): Promise<Buffer> {
  return sharp(buffer, { failOn: "none" })
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

export async function makeThumbWebp(buffer: Buffer, edge: number, quality: number): Promise<Buffer> {
  return sharp(buffer, { failOn: "none" })
    .resize({ width: edge, height: edge, fit: "cover" })
    .webp({ quality })
    .toBuffer();
}
