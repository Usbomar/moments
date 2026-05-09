"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasPipelineSource } from "@/lib/client/canvas-image-ops";

export type CropBox = { x: number; y: number; width: number; height: number };

type Props = {
  source: CanvasPipelineSource;
  onApply: (box: CropBox) => void;
  onCancel: () => void;
  aspectRatio: number | null;
};

type Rect = { x: number; y: number; w: number; h: number };

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move" | "draw" | null;

const MAX_DISPLAY = 720;
const HANDLE = 11;
const MIN = 12;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function pipelineSourceSize(s: CanvasPipelineSource): { w: number; h: number } {
  if (s instanceof HTMLCanvasElement) return { w: s.width, h: s.height };
  return { w: s.naturalWidth, h: s.naturalHeight };
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

function pointInRect(px: number, py: number, r: Rect, pad = 0): boolean {
  return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;
}

function hitHandle(px: number, py: number, r: Rect): HandleId {
  const hz = HANDLE;
  const { x, y, w, h: rh } = r;
  const corners: Array<[HandleId, number, number]> = [
    ["nw", x, y],
    ["ne", x + w, y],
    ["se", x + w, y + rh],
    ["sw", x, y + rh]
  ];
  for (const [id, cx, cy] of corners) {
    if (Math.hypot(px - cx, py - cy) <= hz) return id;
  }
  const mx = x + w / 2;
  const my = y + rh / 2;
  if (Math.abs(px - mx) <= hz / 2 + w / 2 && Math.abs(py - y) <= hz) return "n";
  if (Math.abs(px - mx) <= hz / 2 + w / 2 && Math.abs(py - (y + rh)) <= hz) return "s";
  if (Math.abs(py - my) <= hz / 2 + rh / 2 && Math.abs(px - x) <= hz) return "w";
  if (Math.abs(py - my) <= hz / 2 + rh / 2 && Math.abs(px - (x + w)) <= hz) return "e";
  return null;
}

function applyAspect(w: number, h: number, ar: number | null): { w: number; h: number } {
  if (ar == null || ar <= 0) return { w, h };
  if (w / h > ar) return { w: h * ar, h };
  return { w, h: w / ar };
}

function clampRect(r: Rect, cw: number, ch: number): Rect {
  const w = clamp(r.w, MIN, cw);
  const h = clamp(r.h, MIN, ch);
  const x = clamp(r.x, 0, cw - w);
  const y = clamp(r.y, 0, ch - h);
  return { x, y, w, h };
}

/**
 * Retall estil Photoshop: rectangle amb 8 handles, arrossegar dins per moure,
 * vores fosques fora de la zona i graelles de composició.
 */
export function CropEditor({ source, onApply, onCancel, aspectRatio }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayScale = useMemo(() => {
    const { w: nw, h: nh } = pipelineSourceSize(source);
    return Math.min(MAX_DISPLAY / nw, MAX_DISPLAY / nh, 1);
  }, [source]);
  const [rect, setRect] = useState<Rect | null>(null);
  const dragRef = useRef<{
    kind: HandleId;
    startClient: { x: number; y: number };
    startRect: Rect;
    grab?: { x: number; y: number };
  } | null>(null);

  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * canvas.width;
    const y = ((clientY - r.top) / r.height) * canvas.height;
    return { x, y };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w: nw, h: nh } = pipelineSourceSize(source);
    const sc = displayScale;
    const dw = Math.round(nw * sc);
    const dh = Math.round(nh * sc);
    canvas.width = dw;
    canvas.height = dh;
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(source, 0, 0, nw, nh, 0, 0, dw, dh);

    const r = rect;
    if (r && r.w > MIN && r.h > MIN) {
      const { x, y, w, h: rh } = r;
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fillRect(0, 0, dw, dh);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, rh);
      ctx.clip();
      ctx.drawImage(source, 0, 0, nw, nh, 0, 0, dw, dh);
      ctx.restore();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, rh - 1.5);
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        const gx = x + (w * i) / 3;
        const gy = y + (rh * i) / 3;
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, y + rh);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x + w, gy);
        ctx.stroke();
      }
      const hx = [
        [x, y],
        [x + w / 2, y],
        [x + w, y],
        [x + w, y + rh / 2],
        [x + w, y + rh],
        [x + w / 2, y + rh],
        [x, y + rh],
        [x, y + rh / 2]
      ] as const;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#2563eb";
      for (const [cx, cy] of hx) {
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }, [source, rect, displayScale]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    setRect((prev) => {
      if (prev) {
        return clampRect(prev, canvas.width, canvas.height);
      }
      const m = 0;
      return { x: m, y: m, w: canvas.width - 2 * m, h: canvas.height - 2 * m };
    });
  }, [displayScale, source]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const p = clientToCanvas(e.clientX, e.clientY);
      const canvas = canvasRef.current;
      if (!canvas || !rect) return;
      const hit = hitHandle(p.x, p.y, rect);
      if (hit) {
        dragRef.current = { kind: hit, startClient: p, startRect: { ...rect } };
      } else if (pointInRect(p.x, p.y, rect, -4)) {
        dragRef.current = {
          kind: "move",
          startClient: p,
          startRect: { ...rect },
          grab: { x: p.x - rect.x, y: p.y - rect.y }
        };
      } else {
        dragRef.current = { kind: "draw", startClient: p, startRect: { ...rect } };
        setRect({ x: p.x, y: p.y, w: 1, h: 1 });
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [clientToCanvas, rect]
  );

  const resizeFromHandle = useCallback(
    (handle: Exclude<HandleId, "move" | "draw" | null>, start: Rect, px: number, py: number, cw: number, ch: number) => {
      let { x, y, w, h: rh } = start;
      const ar = aspectRatio;

      const fixAspect = (tw: number, th: number, anchorX: "L" | "R" | "C", anchorY: "T" | "B" | "C"): Rect => {
        let nw = tw;
        let nh = th;
        if (ar != null && ar > 0) {
          const f = applyAspect(nw, nh, ar);
          nw = f.w;
          nh = f.h;
        }
        nw = clamp(nw, MIN, cw);
        nh = clamp(nh, MIN, ch);
        let nx = anchorX === "L" ? x : anchorX === "R" ? x + w - nw : x + (w - nw) / 2;
        let ny = anchorY === "T" ? y : anchorY === "B" ? y + rh - nh : y + (rh - nh) / 2;
        nx = clamp(nx, 0, cw - nw);
        ny = clamp(ny, 0, ch - nh);
        return { x: nx, y: ny, w: nw, h: nh };
      };

      if (handle === "e") {
        const tw = clamp(px - x, MIN, cw - x);
        return fixAspect(tw, rh, "L", "C");
      }
      if (handle === "w") {
        const right = x + w;
        const tw = clamp(right - px, MIN, right);
        return fixAspect(tw, rh, "R", "C");
      }
      if (handle === "s") {
        const th = clamp(py - y, MIN, ch - y);
        return fixAspect(w, th, "C", "T");
      }
      if (handle === "n") {
        const bottom = y + rh;
        const th = clamp(bottom - py, MIN, bottom);
        return fixAspect(w, th, "C", "B");
      }
      if (handle === "se") {
        let tw = clamp(px - x, MIN, cw - x);
        let th = clamp(py - y, MIN, ch - y);
        if (ar != null && ar > 0) {
          if (tw / th > ar) tw = th * ar;
          else th = tw / ar;
        }
        tw = clamp(tw, MIN, cw - x);
        th = clamp(th, MIN, ch - y);
        return { x, y, w: tw, h: th };
      }
      if (handle === "sw") {
        const right = x + w;
        let tw = clamp(right - px, MIN, right);
        let th = clamp(py - y, MIN, ch - y);
        if (ar != null && ar > 0) {
          if (tw / th > ar) tw = th * ar;
          else th = tw / ar;
        }
        tw = clamp(tw, MIN, right);
        th = clamp(th, MIN, ch - y);
        const nx = right - tw;
        return { x: nx, y, w: tw, h: th };
      }
      if (handle === "ne") {
        const bottom = y + rh;
        let tw = clamp(px - x, MIN, cw - x);
        let th = clamp(bottom - py, MIN, bottom);
        if (ar != null && ar > 0) {
          if (tw / th > ar) tw = th * ar;
          else th = tw / ar;
        }
        tw = clamp(tw, MIN, cw - x);
        th = clamp(th, MIN, bottom);
        const ny = bottom - th;
        return { x, y: ny, w: tw, h: th };
      }
      if (handle === "nw") {
        const right = x + w;
        const bottom = y + rh;
        let tw = clamp(right - px, MIN, right);
        let th = clamp(bottom - py, MIN, bottom);
        if (ar != null && ar > 0) {
          if (tw / th > ar) tw = th * ar;
          else th = tw / ar;
        }
        tw = clamp(tw, MIN, right);
        th = clamp(th, MIN, bottom);
        return { x: right - tw, y: bottom - th, w: tw, h: th };
      }
      return start;
    },
    [aspectRatio]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      const canvas = canvasRef.current;
      if (!d || !canvas) return;
      const p = clientToCanvas(e.clientX, e.clientY);
      const cw = canvas.width;
      const ch = canvas.height;

      if (d.kind === "draw") {
        const r = normalizeRect(d.startClient, p);
        setRect(clampRect(r, cw, ch));
        return;
      }
      if (d.kind === "move") {
        if (!d.grab) return;
        const sr = d.startRect;
        let nx = p.x - d.grab.x;
        let ny = p.y - d.grab.y;
        nx = clamp(nx, 0, cw - sr.w);
        ny = clamp(ny, 0, ch - sr.h);
        setRect({ x: nx, y: ny, w: sr.w, h: sr.h });
        return;
      }
      if (d.kind != null) {
        const next = resizeFromHandle(d.kind, d.startRect, p.x, p.y, cw, ch);
        setRect(clampRect(next, cw, ch));
      }
    },
    [clientToCanvas, resizeFromHandle]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleApply = useCallback(() => {
    if (!rect || rect.w < MIN || rect.h < MIN) return;
    const sc = displayScale || 1;
    onApply({
      x: Math.round(rect.x / sc),
      y: Math.round(rect.y / sc),
      width: Math.round(rect.w / sc),
      height: Math.round(rect.h / sc)
    });
  }, [rect, onApply, displayScale]);

  return (
    <div className="crop-editor-overlay" role="dialog" aria-modal="true" aria-label="Retall">
      <div className="crop-editor-panel crop-editor-panel--pro">
        <header className="crop-editor-head">
          <div>
            <h3 className="crop-editor-title">Retall</h3>
            <p className="crop-editor-sub">
              Arrossega els vèrtexs o vores per redimensionar. Arrossega dins del rectangle per moure’l. Clic fora per dibuixar una
              àrea nova. {aspectRatio != null ? `Proporció fixa ${aspectRatio.toFixed(3).replace(/\.?0+$/, "")}.` : "Proporció lliure."}
            </p>
          </div>
          <button type="button" className="crop-editor-icon-btn" onClick={onCancel} aria-label="Tancar">
            ×
          </button>
        </header>
        <div className="crop-editor-canvas-wrap crop-editor-canvas-wrap--pro">
          <canvas
            ref={canvasRef}
            className="crop-editor-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ touchAction: "none", cursor: "crosshair", maxWidth: "100%", display: "block" }}
          />
        </div>
        <footer className="crop-editor-foot">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel·lar
          </button>
          <button type="button" className="btn btn-primary" onClick={handleApply}>
            Aplicar retall
          </button>
        </footer>
      </div>
    </div>
  );
}
