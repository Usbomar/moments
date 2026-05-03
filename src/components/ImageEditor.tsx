"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Asset } from "@/lib/types";
import { analyzeHistogram, applyOperationsToCanvas } from "@/lib/client/canvas-image-ops";
import { MAX_EDIT_HISTORY_CLIENT, type EditOperation, type ExportOptions } from "@/lib/image-edit-ops";

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
  const [exportQuality, setExportQuality] = useState(78);
  const [exportMaxEdge, setExportMaxEdge] = useState(2048);
  const [aiPreview, setAiPreview] = useState<{ dataUrl: string; op: Extract<EditOperation, { type: "autoEnhance" }> } | null>(
    null
  );

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
    const out = applyOperationsToCanvas(src, [...appliedOps, op]);
    setAiPreview({ dataUrl: out.toDataURL("image/jpeg", 0.82), op });
  }, [appliedOps]);

  const handleSave = useCallback(async () => {
    const exportPayload: ExportOptions = {
      webpQuality: exportQuality,
      maxLongEdge: exportMaxEdge
    };
    try {
      const res = await fetch(`/api/assets/${asset.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations: appliedOps, export: exportPayload })
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
  }, [appliedOps, asset.id, exportMaxEdge, exportQuality, onClose, onSaveSuccess]);

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

            <div className="slider-group">
              <label>Redimensionar (px)</label>
              <p className="modal-muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                Amplada i alçada objectiu; marca «Mantenir proporcions» per encaixar dins el rectangle sense deformar.
              </p>
              <ResizeControls onApply={addOp} widthHint={previewDims.w} heightHint={previewDims.h} />
            </div>

            <p className="modal-muted" style={{ fontSize: 12 }}>
              Retall: valors en píxels respecte la imatge actual (després de girs anteriors).
            </p>
            <CropControls onApply={addOp} widthHint={naturalSize.w} heightHint={naturalSize.h} />

            <div className="slider-group">
              <label>Export (pes del fitxer WebP)</label>
              <label>Qualitat WebP: {exportQuality}</label>
              <input
                type="range"
                min={40}
                max={98}
                value={exportQuality}
                onChange={(e) => setExportQuality(Number.parseInt(e.target.value, 10))}
              />
              <label htmlFor="export-max-edge">Costat llarg màx. (px)</label>
              <input
                id="export-max-edge"
                type="number"
                min={0}
                max={8192}
                step={64}
                value={exportMaxEdge}
                onChange={(e) => setExportMaxEdge(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
              />
              <small className="modal-muted">0 = sense redimensionar més enllà de les operacions; combina amb qualitat per reduir MB.</small>
            </div>

            <div className="slider-group">
              <label>Millora amb IA</label>
              <p className="modal-muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                Es genera una previsualització; després pots aplicar-la al flux o descartar-la.
              </p>
              <button type="button" className="primary" onClick={runAiPreview}>
                Previsualitzar millora IA
              </button>
            </div>
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

      {aiPreview ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Previsualització de millora IA"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0,0,0,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            backdropFilter: "blur(6px)"
          }}
          onClick={() => setAiPreview(null)}
        >
          <div
            className="modal-content"
            style={{ maxWidth: "min(92vw, 720px)", width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, fontSize: 18 }}>Millora IA</h3>
            <img src={aiPreview.dataUrl} alt="" style={{ width: "100%", height: "auto", borderRadius: 8 }} />
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setAiPreview(null)}>
                Cancel·lar
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  dispatch({ type: "ADD_OP", op: aiPreview.op });
                  setAiPreview(null);
                }}
              >
                Aplicar millora
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResizeControls({
  onApply,
  widthHint,
  heightHint
}: {
  onApply: (op: EditOperation) => void;
  widthHint: number;
  heightHint: number;
}) {
  const wRef = useRef<HTMLInputElement>(null);
  const hRef = useRef<HTMLInputElement>(null);
  const aspectRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wRef.current && hRef.current) {
      wRef.current.value = String(Math.max(1, widthHint));
      hRef.current.value = String(Math.max(1, heightHint));
    }
  }, [widthHint, heightHint]);

  return (
    <div className="crop-inputs" style={{ flexWrap: "wrap", gap: 8 }}>
      <input ref={wRef} type="number" min={1} aria-label="Amplada objectiu" placeholder="amplada" />
      <input ref={hRef} type="number" min={1} aria-label="Alçada objectiu" placeholder="alçada" />
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
        <input ref={aspectRef} type="checkbox" defaultChecked />
        Mantenir proporcions
      </label>
      <button
        type="button"
        onClick={() => {
          const width = Number.parseInt(wRef.current?.value ?? "1", 10);
          const height = Number.parseInt(hRef.current?.value ?? "1", 10);
          if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return;
          onApply({ type: "resize", width, height, maintainAspect: !!aspectRef.current?.checked });
        }}
      >
        Aplicar mida
      </button>
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
