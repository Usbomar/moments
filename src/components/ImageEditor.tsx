"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import { MAX_EDIT_HISTORY_CLIENT, type EditOperation } from "@/lib/image-edit-ops";

type EditorModel = {
  operations: EditOperation[];
  cursor: number;
  compareOriginal: boolean;
  loadError: string | null;
};

const initialModel: EditorModel = {
  operations: [],
  cursor: 0,
  compareOriginal: false,
  loadError: null
};

type EditorAction =
  | { type: "RESET" }
  | { type: "ADD_OP"; op: EditOperation }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SET_COMPARE"; value: boolean }
  | { type: "SET_LOAD_ERROR"; message: string | null };

function trimHistory(ops: EditOperation[]): EditOperation[] {
  if (ops.length <= MAX_EDIT_HISTORY_CLIENT) return ops;
  return ops.slice(ops.length - MAX_EDIT_HISTORY_CLIENT);
}

function editorReducer(state: EditorModel, action: EditorAction): EditorModel {
  switch (action.type) {
    case "RESET":
      return { ...initialModel };
    case "ADD_OP": {
      const base = state.operations.slice(0, state.cursor);
      let operations = [...base, action.op];
      operations = trimHistory(operations);
      const cursor = operations.length;
      return { ...state, operations, cursor, loadError: null };
    }
    case "UNDO":
      return { ...state, cursor: Math.max(0, state.cursor - 1) };
    case "REDO":
      return { ...state, cursor: Math.min(state.operations.length, state.cursor + 1) };
    case "SET_COMPARE":
      return { ...state, compareOriginal: action.value };
    case "SET_LOAD_ERROR":
      return { ...state, loadError: action.message };
    default:
      return state;
  }
}

function analyzeHistogram(imageData: ImageData): { brightness: number; contrast: number; saturation: number; sharpen: number } {
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

function applyOperationsToCanvas(source: HTMLImageElement, ops: EditOperation[]): HTMLCanvasElement {
  let canvas = document.createElement("canvas");
  let w = source.naturalWidth;
  let h = source.naturalHeight;
  canvas.width = w;
  canvas.height = h;
  let ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");
  ctx.drawImage(source, 0, 0);

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
      case "autoEnhance": {
        const next = document.createElement("canvas");
        next.width = w;
        next.height = h;
        const c2 = next.getContext("2d");
        if (!c2) throw new Error("Canvas 2D no disponible");
        const b = Math.max(5, 100 + op.brightness);
        const c = Math.max(5, 100 + op.contrast);
        const s = Math.max(0, 100 + op.saturation);
        const sh = Math.min(6, op.sharpen / 20);
        c2.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)${sh > 0 ? ` contrast(${100 + sh}%)` : ""}`;
        c2.drawImage(canvas, 0, 0);
        c2.filter = "none";
        canvas = next;
        ctx = c2;
        break;
      }
      default:
        break;
    }
  }
  return canvas;
}

function estimateMb(w: number, h: number, qualityPct: number): number {
  const raw = (w * h * 3 * qualityPct) / 100;
  return raw / (1024 * 1024);
}

interface Props {
  asset: Asset;
  onClose: () => void;
  onDiscard: () => void;
  onSaveSuccess: (asset: Asset) => void;
}

export function ImageEditor({ asset, onClose, onDiscard, onSaveSuccess }: Props) {
  const [model, dispatch] = useReducer(editorReducer, initialModel);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const [sourceEpoch, setSourceEpoch] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ w: asset.width, h: asset.height });
  const [previewDims, setPreviewDims] = useState({ w: asset.width, h: asset.height });

  const appliedOps = useMemo(() => model.operations.slice(0, model.cursor), [model.operations, model.cursor]);

  const imageUrl = (asset.files.originalUrl || asset.files.previewUrl).trim();

  useEffect(() => {
    dispatch({ type: "RESET" });
    queueMicrotask(() => setPreviewDims({ w: asset.width, h: asset.height }));
    if (!imageUrl || asset.type !== "photo") {
      dispatch({ type: "SET_LOAD_ERROR", message: "No hi ha imatge editable." });
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      sourceRef.current = img;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      setNaturalSize({ w: nw, h: nh });
      setPreviewDims({ w: nw, h: nh });
      setSourceEpoch((n) => n + 1);
      dispatch({ type: "SET_LOAD_ERROR", message: null });
    };
    img.onerror = () => {
      sourceRef.current = null;
      dispatch({ type: "SET_LOAD_ERROR", message: "No s’ha pogut carregar la imatge (CORS o URL)." });
    };
    img.src = imageUrl;
  }, [asset.height, asset.id, asset.type, asset.width, imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const src = sourceRef.current;
    if (!canvas || !src || !src.complete || src.naturalWidth === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      if (model.compareOriginal) {
        canvas.width = src.naturalWidth;
        canvas.height = src.naturalHeight;
        ctx.filter = "none";
        ctx.drawImage(src, 0, 0);
        queueMicrotask(() => setPreviewDims({ w: src.naturalWidth, h: src.naturalHeight }));
        return;
      }
      const out = applyOperationsToCanvas(src, appliedOps);
      canvas.width = out.width;
      canvas.height = out.height;
      ctx.filter = "none";
      ctx.drawImage(out, 0, 0);
      queueMicrotask(() => setPreviewDims({ w: out.width, h: out.height }));
    } catch {
      /* Evita setState en boucle des de l’efecte; el canvas quedarà buit si falla. */
    }
  }, [appliedOps, model.compareOriginal, sourceEpoch]);

  const origW = naturalSize.w;
  const origH = naturalSize.h;
  const curW = previewDims.w;
  const curH = previewDims.h;
  const origMb = asset.files.size > 0 ? asset.files.size / (1024 * 1024) : estimateMb(origW, origH, 85);
  const estMb = estimateMb(curW, curH, 72);

  const addOp = useCallback((op: EditOperation) => {
    dispatch({ type: "ADD_OP", op });
  }, []);

  const handleAutoEnhance = useCallback(() => {
    const src = sourceRef.current;
    const canvas = document.createElement("canvas");
    if (!src || !src.complete) return;
    canvas.width = Math.min(320, src.naturalWidth);
    canvas.height = Math.min(320, src.naturalHeight);
    const c = canvas.getContext("2d");
    if (!c) return;
    c.drawImage(src, 0, 0, canvas.width, canvas.height);
    const data = c.getImageData(0, 0, canvas.width, canvas.height);
    const adj = analyzeHistogram(data);
    dispatch({
      type: "ADD_OP",
      op: {
        type: "autoEnhance",
        brightness: adj.brightness,
        contrast: adj.contrast,
        saturation: adj.saturation,
        sharpen: adj.sharpen
      }
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!appliedOps.length) {
      onClose();
      return;
    }
    try {
      const res = await fetch(`/api/assets/${asset.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations: appliedOps })
      });
      const body = (await res.json()) as { asset?: Asset; error?: string };
      if (!res.ok || !body.asset) {
        dispatch({ type: "SET_LOAD_ERROR", message: body.error ?? "Error en desar" });
        return;
      }
      onSaveSuccess(body.asset);
      onClose();
    } catch {
      dispatch({ type: "SET_LOAD_ERROR", message: "Error de xarxa en desar." });
    }
  }, [appliedOps, asset.id, onClose, onSaveSuccess]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "UNDO" });
      } else if ((mod && e.key.toLowerCase() === "y") || (mod && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        dispatch({ type: "REDO" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const canUndo = model.cursor > 0;
  const canRedo = model.cursor < model.operations.length;

  if (asset.type !== "photo") {
    return (
      <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onDiscard}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <p>Només es poden editar fotos.</p>
          <button type="button" onClick={onDiscard}>
            Tancar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay modal-overlay--front" role="dialog" aria-modal="true" aria-label="Editor d’imatge" onClick={onDiscard}>
      <div className="modal-content editor-container" onClick={(e) => e.stopPropagation()}>
        <header className="editor-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>Editar imatge</h2>
          <button type="button" className="modal-close" onClick={onDiscard} aria-label="Tancar">
            ×
          </button>
        </header>

        {model.loadError ? <p className="modal-error">{model.loadError}</p> : null}

        <div className="editor-body">
          <div className="editor-preview-col">
            <canvas ref={canvasRef} className="canvas-preview" width={origW} height={origH} />
            <label className="before-after-toggle">
              <input
                type="checkbox"
                checked={model.compareOriginal}
                onChange={(e) => dispatch({ type: "SET_COMPARE", value: e.target.checked })}
              />
              Mostrar original (abans)
            </label>
            <div className={`file-size-indicator ${estMb > 2 ? "file-size-indicator--warn" : ""}`}>
              Original: {origMb.toFixed(2)} MB → Estimat: ~{estMb.toFixed(2)} MB
            </div>
          </div>

          <div className="editor-controls-col">
            <div className="operation-list">
              <button type="button" disabled={!canUndo} onClick={() => dispatch({ type: "UNDO" })}>
                Desfer
              </button>
              <button type="button" disabled={!canRedo} onClick={() => dispatch({ type: "REDO" })}>
                Refer
              </button>
              <span className="modal-muted" style={{ alignSelf: "center" }}>
                {model.cursor}/{model.operations.length} passos
              </span>
            </div>

            <div className="slider-group">
              <label>Lluminositat (deixa anar per aplicar)</label>
              <div className="slider-row">
                <input
                  type="range"
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onPointerUp={(e) =>
                    addOp({ type: "brightness", value: Number.parseInt((e.target as HTMLInputElement).value, 10) })
                  }
                />
              </div>
            </div>
            <div className="slider-group">
              <label>Contrast</label>
              <div className="slider-row">
                <input
                  type="range"
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onPointerUp={(e) =>
                    addOp({ type: "contrast", value: Number.parseInt((e.target as HTMLInputElement).value, 10) })
                  }
                />
              </div>
            </div>
            <div className="slider-group">
              <label>Saturació</label>
              <div className="slider-row">
                <input
                  type="range"
                  min={-100}
                  max={100}
                  defaultValue={0}
                  onPointerUp={(e) =>
                    addOp({ type: "saturation", value: Number.parseInt((e.target as HTMLInputElement).value, 10) })
                  }
                />
              </div>
            </div>
            <div className="slider-group">
              <label>Desenfoc</label>
              <div className="slider-row">
                <input
                  type="range"
                  min={0}
                  max={20}
                  defaultValue={0}
                  onPointerUp={(e) =>
                    addOp({ type: "blur", value: Number.parseInt((e.target as HTMLInputElement).value, 10) })
                  }
                />
              </div>
            </div>
            <div className="slider-group">
              <label>Enfoc (aprox.)</label>
              <div className="slider-row">
                <input
                  type="range"
                  min={0}
                  max={100}
                  defaultValue={0}
                  onPointerUp={(e) =>
                    addOp({ type: "sharpen", value: Number.parseInt((e.target as HTMLInputElement).value, 10) })
                  }
                />
              </div>
            </div>

            <div className="slider-group">
              <label>Girar</label>
              <div className="operation-list">
                <button type="button" onClick={() => addOp({ type: "rotate", angle: 90 })}>
                  90°
                </button>
                <button type="button" onClick={() => addOp({ type: "rotate", angle: 180 })}>
                  180°
                </button>
                <button type="button" onClick={() => addOp({ type: "rotate", angle: 270 })}>
                  270°
                </button>
              </div>
            </div>

            <p className="modal-muted" style={{ fontSize: 12 }}>
              Retall: valors en píxels respecte la imatge actual (després de girs anteriors).
            </p>
            <CropControls onApply={addOp} widthHint={naturalSize.w} heightHint={naturalSize.h} />

            <button type="button" className="primary" style={{ marginTop: 8 }} onClick={handleAutoEnhance}>
              Millora automàtica
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onDiscard}>
            Descartar
          </button>
          <button type="button" className="primary" onClick={() => void handleSave()}>
            Desar imatge
          </button>
        </div>
      </div>
    </div>
  );
}

function CropControls({
  onApply,
  widthHint,
  heightHint
}: {
  onApply: (op: EditOperation) => void;
  widthHint: number;
  heightHint: number;
}) {
  const xRef = useRef<HTMLInputElement>(null);
  const yRef = useRef<HTMLInputElement>(null);
  const wRef = useRef<HTMLInputElement>(null);
  const hRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wRef.current && hRef.current && xRef.current && yRef.current) {
      xRef.current.value = "0";
      yRef.current.value = "0";
      wRef.current.value = String(Math.max(1, widthHint));
      hRef.current.value = String(Math.max(1, heightHint));
    }
  }, [widthHint, heightHint]);

  return (
    <div className="slider-group">
      <label>Retall (px)</label>
      <div className="crop-inputs">
        <input ref={xRef} type="number" min={0} aria-label="X" placeholder="x" />
        <input ref={yRef} type="number" min={0} aria-label="Y" placeholder="y" />
        <input ref={wRef} type="number" min={1} aria-label="Amplada" placeholder="w" />
        <input ref={hRef} type="number" min={1} aria-label="Alçada" placeholder="h" />
        <button
          type="button"
          onClick={() => {
            const x = Number.parseInt(xRef.current?.value ?? "0", 10);
            const y = Number.parseInt(yRef.current?.value ?? "0", 10);
            const width = Number.parseInt(wRef.current?.value ?? "1", 10);
            const height = Number.parseInt(hRef.current?.value ?? "1", 10);
            if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return;
            onApply({ type: "crop", x, y, width, height });
          }}
        >
          Aplicar retall
        </button>
      </div>
    </div>
  );
}
