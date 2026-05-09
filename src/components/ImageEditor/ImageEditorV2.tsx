"use client";

import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";
import type { Asset } from "@/lib/types";
import { analyzeHistogram, applyOperationsToCanvas } from "@/lib/client/canvas-image-ops";
import { MAX_EDIT_HISTORY_CLIENT, type EditOperation, type ExportOptions } from "@/lib/image-edit-ops";

type AdjustmentDraft = {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  sharpen: number;
};

const INITIAL_ADJUSTMENT_DRAFT: AdjustmentDraft = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  sharpen: 0
};

function draftHasValues(d: AdjustmentDraft): boolean {
  return d.brightness !== 0 || d.contrast !== 0 || d.saturation !== 0 || d.blur !== 0 || d.sharpen !== 0;
}

function draftToPreviewOp(d: AdjustmentDraft): EditOperation | null {
  if (!draftHasValues(d)) return null;
  return {
    type: "adjustmentBatch",
    brightness: d.brightness,
    contrast: d.contrast,
    saturation: d.saturation,
    blur: d.blur,
    sharpen: d.sharpen
  };
}
import { Histogram } from "@/components/ImageEditor/Histogram";
import { CropEditor } from "@/components/ImageEditor/CropEditor";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

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

function estimateMb(w: number, h: number, webpQuality: number): number {
  const q = Math.max(40, Math.min(98, webpQuality)) / 100;
  return (Math.max(1, w) * Math.max(1, h) * 0.28 * q) / (1024 * 1024);
}

function sampleImageDataFromCanvas(canvas: HTMLCanvasElement): ImageData | null {
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return null;
  const maxEdge = 200;
  const sc = Math.min(1, maxEdge / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * sc));
  const sh = Math.max(1, Math.round(h * sc));
  const s = document.createElement("canvas");
  s.width = sw;
  s.height = sh;
  const c = s.getContext("2d");
  if (!c) return null;
  c.drawImage(canvas, 0, 0, w, h, 0, 0, sw, sh);
  return c.getImageData(0, 0, sw, sh);
}

class EditorCanvasBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null };
  static getDerivedStateFromError(error: Error) {
    return { err: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[ImageEditorV2 canvas]", error, info.componentStack);
    }
  }
  render() {
    if (this.state.err) {
      return (
        <div className="editor-v2-canvas-error" role="alert">
          Error al canvas: {this.state.err}
        </div>
      );
    }
    return this.props.children;
  }
}

type Props = {
  asset: Asset;
  onDiscard: () => void;
  /** Desa al servidor (mateix contracte que POST /api/assets/[id]/edit). */
  onSave: (operations: EditOperation[], exportOpts: ExportOptions) => Promise<void>;
};

export function ImageEditorV2({ asset, onDiscard, onSave }: Props) {
  const [model, dispatch] = useReducer(editorReducer, initialModel);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const [sourceEpoch, setSourceEpoch] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ w: asset.width, h: asset.height });
  const [previewDims, setPreviewDims] = useState({ w: asset.width, h: asset.height });
  const [exportQuality, setExportQuality] = useState(78);
  const [exportMaxEdge, setExportMaxEdge] = useState(2048);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [dragPan, setDragPan] = useState<{ active: boolean; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [toolTab, setToolTab] = useState<"adjust" | "detail" | "geometry" | "export">("adjust");
  const [draftAdjust, setDraftAdjust] = useState<AdjustmentDraft>(INITIAL_ADJUSTMENT_DRAFT);
  const [histData, setHistData] = useState<ImageData | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSnapshot, setCropSnapshot] = useState<HTMLCanvasElement | null>(null);
  const [cropAspectKey, setCropAspectKey] = useState<"free" | "1" | "4:3" | "16:9" | "3:2">("free");
  const [aiPreview, setAiPreview] = useState<{ dataUrl: string; op: Extract<EditOperation, { type: "autoEnhance" }> } | null>(null);
  const zKeyRef = useRef(false);

  const appliedOps = useMemo(() => model.operations.slice(0, model.cursor), [model.operations, model.cursor]);
  const previewOps = useMemo(() => {
    const tail = draftToPreviewOp(draftAdjust);
    return tail ? [...appliedOps, tail] : appliedOps;
  }, [appliedOps, draftAdjust]);
  const imageUrl = (asset.files.originalUrl || asset.files.previewUrl).trim();

  useEffect(() => {
    dispatch({ type: "RESET" });
    setDraftAdjust(INITIAL_ADJUSTMENT_DRAFT);
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
      } else {
        const out = applyOperationsToCanvas(src, previewOps);
        canvas.width = out.width;
        canvas.height = out.height;
        ctx.filter = "none";
        ctx.drawImage(out, 0, 0);
        queueMicrotask(() => setPreviewDims({ w: out.width, h: out.height }));
      }
      const sampled = sampleImageDataFromCanvas(canvas);
      queueMicrotask(() => setHistData(sampled));
    } catch {
      /* evita loop */
    }
  }, [previewOps, model.compareOriginal, sourceEpoch]);

  const origW = naturalSize.w;
  const origH = naturalSize.h;
  const curW = previewDims.w;
  const curH = previewDims.h;
  const origMb = asset.files.size > 0 ? asset.files.size / (1024 * 1024) : estimateMb(origW, origH, 85);
  let estW = curW;
  let estH = curH;
  if (exportMaxEdge > 0) {
    const m = Math.max(estW, estH);
    if (m > exportMaxEdge) {
      const s = exportMaxEdge / m;
      estW = Math.max(1, Math.round(estW * s));
      estH = Math.max(1, Math.round(estH * s));
    }
  }
  const estMb = estimateMb(estW, estH, exportQuality);

  const addOp = useCallback((op: EditOperation) => {
    dispatch({ type: "ADD_OP", op });
  }, []);

  const commitDraftAdjustments = useCallback(() => {
    const op = draftToPreviewOp(draftAdjust);
    if (!op) return;
    dispatch({ type: "ADD_OP", op });
    setDraftAdjust(INITIAL_ADJUSTMENT_DRAFT);
  }, [draftAdjust]);

  const beginCrop = useCallback(() => {
    const src = sourceRef.current;
    if (!src?.complete || src.naturalWidth === 0) return;
    try {
      setCropSnapshot(applyOperationsToCanvas(src, previewOps));
      setCropOpen(true);
    } catch {
      dispatch({ type: "SET_LOAD_ERROR", message: "No s’ha pogut preparar el retall." });
    }
  }, [previewOps]);

  const endCrop = useCallback(() => {
    setCropSnapshot(null);
    setCropOpen(false);
  }, []);

  const runAiPreview = useCallback(() => {
    const src = sourceRef.current;
    if (!src || !src.complete) return;
    const sample = document.createElement("canvas");
    sample.width = Math.min(360, src.naturalWidth);
    sample.height = Math.min(360, src.naturalHeight);
    const sc = sample.getContext("2d");
    if (!sc) return;
    sc.drawImage(src, 0, 0, sample.width, sample.height);
    const adj = analyzeHistogram(sc.getImageData(0, 0, sample.width, sample.height));
    const maxDim = Math.max(src.naturalWidth, src.naturalHeight);
    const targetMaxEdge = maxDim > 2200 ? 1920 : maxDim > 1600 ? 1600 : undefined;
    const op: Extract<EditOperation, { type: "autoEnhance" }> = {
      type: "autoEnhance",
      brightness: adj.brightness,
      contrast: adj.contrast,
      saturation: adj.saturation,
      sharpen: adj.sharpen,
      ...(targetMaxEdge != null ? { targetMaxEdge } : {})
    };
    const out = applyOperationsToCanvas(src, [...previewOps, op]);
    setAiPreview({ dataUrl: out.toDataURL("image/jpeg", 0.82), op });
  }, [previewOps]);

  const handleSave = useCallback(async () => {
    const exportPayload: ExportOptions = { webpQuality: exportQuality, maxLongEdge: exportMaxEdge };
    try {
      await onSave(appliedOps, exportPayload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error en desar.";
      dispatch({ type: "SET_LOAD_ERROR", message: msg });
    }
  }, [appliedOps, exportMaxEdge, exportQuality, onSave]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key.toLowerCase() === "z" && !mod) zKeyRef.current = true;
      if (e.key.toLowerCase() === "m" && !mod) {
        e.preventDefault();
        setPanMode((p) => !p);
      }
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "UNDO" });
      } else if ((mod && e.key.toLowerCase() === "y") || (mod && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        dispatch({ type: "REDO" });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "z" && !(e.ctrlKey || e.metaKey)) zKeyRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (aiPreview) {
        setAiPreview(null);
        return;
      }
      if (cropOpen) {
        endCrop();
        return;
      }
      onDiscard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aiPreview, cropOpen, endCrop, onDiscard]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const t = e.target as Node | null;
      if (!canvasRef.current || !t || !canvasRef.current.contains(t)) return;
      if (!zKeyRef.current && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clamp(z - Math.sign(e.deltaY) * 0.08, 0.5, 3));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  const canUndo = model.cursor > 0;
  const canRedo = model.cursor < model.operations.length;

  const onPointerDownPan = useCallback(
    (e: React.PointerEvent) => {
      if (!panMode) return;
      setDragPan({ active: true, sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [panMode, pan.x, pan.y]
  );

  const onPointerMovePan = useCallback(
    (e: React.PointerEvent) => {
      if (!dragPan?.active) return;
      setPan({ x: dragPan.ox + (e.clientX - dragPan.sx), y: dragPan.oy + (e.clientY - dragPan.sy) });
    },
    [dragPan]
  );

  const onPointerUpPan = useCallback((e: React.PointerEvent) => {
    setDragPan(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  if (asset.type !== "photo") {
    return (
      <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onDiscard}>
        <div className="modal-content" onClick={(ev) => ev.stopPropagation()}>
          <p>Només es poden editar fotos.</p>
          <button type="button" className="btn" onClick={onDiscard}>
            Tancar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay modal-overlay--front editor-v2-overlay" role="dialog" aria-modal="true" aria-label="Editor d’imatge" onClick={onDiscard}>
      <div className="editor-v2-shell" onClick={(ev) => ev.stopPropagation()}>
        <header className="editor-v2-header">
          <h2 className="editor-v2-title">Editor d’imatge</h2>
          <button type="button" className="modal-close" onClick={onDiscard} aria-label="Tancar">
            ×
          </button>
        </header>

        {model.loadError ? <p className="modal-error">{model.loadError}</p> : null}

        <div className="editor-v2-body">
          <div className="editor-v2-canvas-col">
            <EditorCanvasBoundary>
              <div className="editor-v2-toolbar">
                <button type="button" className="btn btn-sm" onClick={() => setZoom((z) => clamp(z - 0.15, 0.5, 3))} aria-label="Allunyar">
                  −
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setZoom(1)} aria-label="Zoom 1:1">
                  1:1
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setZoom((z) => clamp(z + 0.15, 0.5, 3))} aria-label="Apropar">
                  +
                </button>
                <button type="button" className={`btn btn-sm ${panMode ? "btn-primary" : ""}`} onClick={() => setPanMode((p) => !p)} aria-pressed={panMode} title="Tecla M">
                  Pan
                </button>
                <span className="editor-v2-meta">{Math.round(zoom * 100)}%</span>
              </div>
              <div
                className="editor-v2-canvas-wrap"
                onPointerDown={onPointerDownPan}
                onPointerMove={onPointerMovePan}
                onPointerUp={onPointerUpPan}
                onPointerCancel={onPointerUpPan}
                style={{ cursor: panMode ? (dragPan?.active ? "grabbing" : "grab") : "default" }}
              >
                <div
                  className="editor-v2-canvas-inner"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center"
                  }}
                >
                  <canvas ref={canvasRef} className="editor-v2-canvas" width={origW} height={origH} />
                </div>
              </div>
            </EditorCanvasBoundary>
            <label className="editor-v2-compare">
              <input type="checkbox" checked={model.compareOriginal} onChange={(e) => dispatch({ type: "SET_COMPARE", value: e.target.checked })} />
              Abans / després
            </label>
            <p className="modal-muted editor-v2-shortcuts">
              Z + rodeta: zoom · M: pan · Ctrl+Z / Ctrl+⇧+Z o Ctrl+Y: desfer / refer · Esc: tancar
            </p>
            <div className={`file-size-indicator ${estMb > 2 ? "file-size-indicator--warn" : ""}`}>
              Original: {origMb.toFixed(2)} MB → Estimat: ~{estMb.toFixed(2)} MB · {curW}×{curH} px
            </div>
          </div>

          <aside className="editor-v2-tools" aria-label="Eines">
            <div className="editor-v2-undo-row">
              <button type="button" className="btn btn-sm" disabled={!canUndo} onClick={() => dispatch({ type: "UNDO" })} aria-label="Desfer">
                ←
              </button>
              <button type="button" className="btn btn-sm" disabled={!canRedo} onClick={() => dispatch({ type: "REDO" })} aria-label="Refer">
                →
              </button>
              <span className="editor-v2-meta">
                {model.cursor}/{model.operations.length}
              </span>
            </div>

            <div className="editor-v2-tabs" role="tablist" aria-label="Panells d’edició">
              {(
                [
                  ["adjust", "Llum i color"],
                  ["detail", "Detall"],
                  ["geometry", "Geometria"],
                  ["export", "Export"]
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={toolTab === id}
                  className={`editor-v2-tab ${toolTab === id ? "editor-v2-tab--active" : ""}`}
                  onClick={() => setToolTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="editor-v2-tab-panel" role="tabpanel">
              {toolTab === "adjust" ? (
                <div className="editor-v2-panel-stack">
                  <p className="editor-v2-panel-hint">
                    Mou els controls: la vista prèvia s’actualitza al moment. Quan tinguis el resultat desitjat, aplica al document per registrar un sol pas a l’historial.
                  </p>
                  {draftHasValues(draftAdjust) ? (
                    <p className="editor-v2-panel-warn">Canvis sense aplicar a l’historial.</p>
                  ) : null}
                  <EditorSliderRow
                    id="v2-br"
                    label="Lluminositat"
                    min={-100}
                    max={100}
                    value={draftAdjust.brightness}
                    onChange={(v) => setDraftAdjust((d) => ({ ...d, brightness: v }))}
                  />
                  <EditorSliderRow
                    id="v2-ct"
                    label="Contrast"
                    min={-100}
                    max={100}
                    value={draftAdjust.contrast}
                    onChange={(v) => setDraftAdjust((d) => ({ ...d, contrast: v }))}
                  />
                  <EditorSliderRow
                    id="v2-sat"
                    label="Saturació"
                    min={-100}
                    max={100}
                    value={draftAdjust.saturation}
                    onChange={(v) => setDraftAdjust((d) => ({ ...d, saturation: v }))}
                  />
                  <div className="editor-v2-draft-actions">
                    <button type="button" className="btn btn-sm btn-ghost" disabled={!draftHasValues(draftAdjust)} onClick={() => setDraftAdjust(INITIAL_ADJUSTMENT_DRAFT)}>
                      Reinicia previsualització
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" disabled={!draftHasValues(draftAdjust)} onClick={commitDraftAdjustments}>
                      Aplica al document
                    </button>
                  </div>
                </div>
              ) : null}

              {toolTab === "detail" ? (
                <div className="editor-v2-panel-stack">
                  <p className="editor-v2-panel-hint">Enfoc i desenfoc formen part del mateix pas d’ajust quan apliquis al document.</p>
                  <EditorSliderRow
                    id="v2-sh"
                    label="Enfoc"
                    min={0}
                    max={100}
                    value={draftAdjust.sharpen}
                    onChange={(v) => setDraftAdjust((d) => ({ ...d, sharpen: v }))}
                  />
                  <EditorSliderRow
                    id="v2-bl"
                    label="Desenfoc"
                    min={0}
                    max={20}
                    value={draftAdjust.blur}
                    onChange={(v) => setDraftAdjust((d) => ({ ...d, blur: v }))}
                  />
                  <div className="editor-v2-draft-actions">
                    <button type="button" className="btn btn-sm btn-ghost" disabled={!draftHasValues(draftAdjust)} onClick={() => setDraftAdjust(INITIAL_ADJUSTMENT_DRAFT)}>
                      Reinicia previsualització
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" disabled={!draftHasValues(draftAdjust)} onClick={commitDraftAdjustments}>
                      Aplica al document
                    </button>
                  </div>
                </div>
              ) : null}

              {toolTab === "geometry" ? (
                <div className="editor-v2-panel-stack">
                  <p className="editor-v2-panel-hint">Gira la imatge o retalla amb rectangle tipus Photoshop (vores, cantonades, moure dins l’àrea).</p>
                  <div className="editor-v2-btn-row editor-v2-btn-row--seg">
                    <button type="button" className="btn btn-sm" onClick={() => addOp({ type: "rotate", angle: 90 })}>
                      90°
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => addOp({ type: "rotate", angle: 180 })}>
                      180°
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => addOp({ type: "rotate", angle: 270 })}>
                      270°
                    </button>
                  </div>
                  <div className="editor-v2-field">
                    <label htmlFor="v2-crop-aspect">Proporció del retall</label>
                    <select
                      id="v2-crop-aspect"
                      className="editor-v2-select editor-v2-select--inline"
                      value={cropAspectKey}
                      onChange={(e) => setCropAspectKey(e.target.value as typeof cropAspectKey)}
                    >
                      <option value="free">Lliure</option>
                      <option value="1">1:1</option>
                      <option value="4:3">4:3</option>
                      <option value="16:9">16:9</option>
                      <option value="3:2">3:2</option>
                    </select>
                  </div>
                  <button type="button" className="btn btn-primary editor-v2-full-btn" onClick={beginCrop}>
                    Retallar…
                  </button>
                </div>
              ) : null}

              {toolTab === "export" ? (
                <div className="editor-v2-panel-stack">
                  <div className="editor-v2-field">
                    <label htmlFor="v2-webp-q">Qualitat WebP: {exportQuality}</label>
                    <input
                      id="v2-webp-q"
                      type="range"
                      min={40}
                      max={98}
                      value={exportQuality}
                      onChange={(e) => setExportQuality(Number.parseInt(e.target.value, 10))}
                    />
                  </div>
                  <div className="editor-v2-field">
                    <label htmlFor="v2-max-edge">Costat llarg màxim (px)</label>
                    <input
                      id="v2-max-edge"
                      type="number"
                      min={0}
                      max={8192}
                      step={64}
                      value={exportMaxEdge}
                      onChange={(e) => setExportMaxEdge(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="editor-v2-histogram-block">
              <span className="editor-v2-histogram-label">Histograma</span>
              <Histogram imageData={histData} width={200} height={100} />
            </div>
          </aside>
        </div>

        <footer className="editor-v2-footer">
          <button type="button" className="btn" onClick={onDiscard}>
            Cancel·lar
          </button>
          <button type="button" className="btn" onClick={runAiPreview}>
            Millorar amb IA
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void handleSave()}>
            Desar canvis
          </button>
        </footer>
      </div>

      {cropOpen && cropSnapshot ? (
        <CropEditor
          source={cropSnapshot}
          aspectRatio={cropAspectKey === "free" ? null : cropAspectKey === "1" ? 1 : cropAspectKey === "4:3" ? 4 / 3 : cropAspectKey === "16:9" ? 16 / 9 : 3 / 2}
          onCancel={endCrop}
          onApply={(box) => {
            addOp({ type: "crop", ...box });
            endCrop();
          }}
        />
      ) : null}

      {aiPreview ? (
        <div className="editor-v2-ai-overlay" role="dialog" aria-modal="true" aria-label="Previsualització IA" onClick={() => setAiPreview(null)}>
          <div className="modal-content editor-v2-ai-dialog" onClick={(ev) => ev.stopPropagation()}>
            <h3>Millora IA</h3>
            <img src={aiPreview.dataUrl} alt="Previsualització millora" width={640} height={400} style={{ width: "100%", height: "auto" }} />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setAiPreview(null)}>
                Cancel·lar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  dispatch({ type: "ADD_OP", op: aiPreview.op });
                  setAiPreview(null);
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EditorSliderRow({
  id,
  label,
  min,
  max,
  value,
  onChange
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="editor-v2-slider-row">
      <div className="editor-v2-slider-head">
        <label htmlFor={id}>{label}</label>
        <span className="editor-v2-slider-value" aria-live="polite">
          {value}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number.parseInt(e.target.value, 10))} />
    </div>
  );
}
