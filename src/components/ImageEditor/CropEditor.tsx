"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasPipelineSource } from "@/lib/client/canvas-image-ops";

export type CropBox = { x: number; y: number; width: number; height: number };

type Props = {
  /** Imatge original o previsualització ja amb rotació/ajustos aplicats (coordenades = pipeline servidor). */
  source: CanvasPipelineSource;
  onApply: (box: CropBox) => void;
  onCancel: () => void;
  /** null = lliure */
  aspectRatio: number | null;
};

type Rect = { x: number; y: number; w: number; h: number };

const MAX_DISPLAY = 520;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

/**
 * Retall visual sobre canvas escalat; coordenades en píxels naturals de la imatge.
 */
function pipelineSourceSize(s: CanvasPipelineSource): { w: number; h: number } {
  if (s instanceof HTMLCanvasElement) return { w: s.width, h: s.height };
  return { w: s.naturalWidth, h: s.naturalHeight };
}

export function CropEditor({ source, onApply, onCancel, aspectRatio }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ phase: "none" | "new" | "move"; start: { x: number; y: number }; rect: Rect | null }>(
    { phase: "none", start: { x: 0, y: 0 }, rect: null }
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w: nw, h: nh } = pipelineSourceSize(source);
    const sc = Math.min(MAX_DISPLAY / nw, MAX_DISPLAY / nh, 1);
    const dw = Math.round(nw * sc);
    const dh = Math.round(nh * sc);
    canvas.width = dw;
    canvas.height = dh;
    setScale(sc);
    ctx.drawImage(source, 0, 0, nw, nh, 0, 0, dw, dh);
    if (drag.rect && drag.rect.w > 2 && drag.rect.h > 2) {
      const { x, y, w, h } = drag.rect;
      const sx = x / sc;
      const sy = y / sc;
      const sw = w / sc;
      const sh = h / sc;
      ctx.fillStyle = "rgba(0,0,0,0.42)";
      ctx.fillRect(0, 0, dw, dh);
      ctx.drawImage(source, sx, sy, sw, sh, x, y, w, h);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(x + (w * i) / 3, y);
        ctx.lineTo(x + (w * i) / 3, y + h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + (h * i) / 3);
        ctx.lineTo(x + w, y + (h * i) / 3);
        ctx.stroke();
      }
    }
  }, [source, drag.rect]);

  useEffect(() => {
    draw();
  }, [draw]);

  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * canvas.width;
    const y = ((clientY - r.top) / r.height) * canvas.height;
    return { x, y };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const p = clientToCanvas(e.clientX, e.clientY);
      setDrag({ phase: "new", start: p, rect: null });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [clientToCanvas]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (drag.phase === "none") return;
      const p = clientToCanvas(e.clientX, e.clientY);
      let rect = normalizeRect(drag.start, p);
      const canvas = canvasRef.current;
      if (canvas) {
        rect.x = clamp(rect.x, 0, canvas.width - 1);
        rect.y = clamp(rect.y, 0, canvas.height - 1);
        rect.w = clamp(rect.w, 1, canvas.width - rect.x);
        rect.h = clamp(rect.h, 1, canvas.height - rect.y);
        if (aspectRatio != null && aspectRatio > 0) {
          let { w, h } = rect;
          if (w / h > aspectRatio) w = h * aspectRatio;
          else h = w / aspectRatio;
          rect = { ...rect, w: Math.min(w, canvas.width - rect.x), h: Math.min(h, canvas.height - rect.y) };
        }
      }
      setDrag((prev) => ({ ...prev, phase: "move", rect }));
    },
    [drag.phase, drag.start, clientToCanvas, aspectRatio]
  );

  const onPointerUp = useCallback(() => {
    setDrag((prev) => ({ ...prev, phase: "none" }));
  }, []);

  const handleApply = useCallback(() => {
    if (!drag.rect || drag.rect.w < 4 || drag.rect.h < 4) return;
    const { x, y, w, h } = drag.rect;
    const sc = scale || 1;
    onApply({
      x: Math.round(x / sc),
      y: Math.round(y / sc),
      width: Math.round(w / sc),
      height: Math.round(h / sc)
    });
  }, [drag.rect, onApply, scale]);

  return (
    <div className="crop-editor-overlay" role="dialog" aria-modal="true" aria-label="Retall visual">
      <div className="crop-editor-panel">
        <h3 className="crop-editor-title">Retall</h3>
        <p className="modal-muted" style={{ fontSize: 12, marginTop: 0 }}>
          Arrossega per delimitar la zona. La vista reflecteix rotació i ajustos ja aplicats; les coordenades coincideixen amb el pipeline del servidor.
        </p>
        <div ref={wrapRef} className="crop-editor-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="crop-editor-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{ touchAction: "none", cursor: "crosshair", maxWidth: "100%" }}
          />
        </div>
        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel·lar
          </button>
          <button type="button" className="btn btn-primary" onClick={handleApply}>
            Aplicar retall
          </button>
        </div>
      </div>
    </div>
  );
}
