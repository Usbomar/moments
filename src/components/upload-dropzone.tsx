"use client";

import { useCallback, useRef, useState } from "react";

interface Props {
  onUploaded: () => Promise<void>;
  /** undefined = encara comprovant; false = sense Supabase; true = pujada disponible */
  supabaseConfigured?: boolean;
  missingEnv?: string[];
}

type RowStatus = "pending" | "uploading" | "ok" | "error";

interface FileRowState {
  id: string;
  name: string;
  size: number;
  status: RowStatus;
  error?: string;
}

const CONCURRENCY = 5;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400 * 7) return "—";
  if (seconds < 90) return `~${Math.max(1, Math.ceil(seconds))} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `~${m} min ${s} s`;
}

function mapUploadError(payload: { error?: string; message?: string }): string {
  if (payload.error === "SUPABASE_NOT_CONFIGURED" && payload.message) {
    return payload.message;
  }
  if (payload.error === "SUPABASE_NOT_CONFIGURED") {
    return "Supabase no està configurat. Afegeix NEXT_PUBLIC_SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY a .env.local.";
  }
  return payload.message ?? payload.error ?? "No s’ha pogut pujar el fitxer.";
}

async function uploadOne(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const payload = (await response.json()) as { error?: string; message?: string };
    if (!response.ok) {
      return { ok: false, error: mapUploadError(payload) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de xarxa" };
  }
}

/**
 * Runs `fn` on each item with at most `limit` concurrent executions.
 * Index order is preserved in results (same as `items` order).
 */
async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

export function UploadDropzone({ onUploaded, supabaseConfigured, missingEnv = [] }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [fileRows, setFileRows] = useState<FileRowState[]>([]);
  const [etaText, setEtaText] = useState<string | null>(null);

  const ready = supabaseConfigured === true;
  const checking = supabaseConfigured === undefined;

  const uploadFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || !ready) return;

      const files = Array.from(fileList);
      const total = files.length;
      const totalBytes = files.reduce((s, f) => s + f.size, 0);

      const initialRows: FileRowState[] = files.map((f, i) => ({
        id: `${i}-${f.name}-${f.size}`,
        name: f.name,
        size: f.size,
        status: "pending"
      }));

      setBusy(true);
      setFileRows(initialRows);
      setEtaText(null);
      setStatus(`Pujant 0/${total}... 0 amb error`);

      const t0 = performance.now();
      let finished = 0;
      let failedCount = 0;
      let bytesDone = 0;

      const updateRow = (index: number, patch: Partial<FileRowState>) => {
        setFileRows((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], ...patch };
          return next;
        });
      };

      const bumpProgress = (file: File, ok: boolean) => {
        finished += 1;
        if (!ok) failedCount += 1;
        bytesDone += file.size;
        const elapsedSec = (performance.now() - t0) / 1000;
        const bps = bytesDone / Math.max(elapsedSec, 0.001);
        const remainingBytes = totalBytes - bytesDone;
        const etaSec = bps > 0 && remainingBytes > 0 ? remainingBytes / bps : NaN;
        setEtaText(finished >= total || !Number.isFinite(etaSec) ? null : formatEta(etaSec));
        setStatus(`Pujant ${finished}/${total}... ${failedCount} amb error`);
      };

      try {
        await mapPool(files, CONCURRENCY, async (file, index) => {
          updateRow(index, { status: "uploading" });
          const result = await uploadOne(file);
          if (result.ok) {
            updateRow(index, { status: "ok" });
            bumpProgress(file, true);
          } else {
            updateRow(index, { status: "error", error: result.error });
            bumpProgress(file, false);
          }
          return result;
        });

        if (failedCount === 0) {
          setStatus("Pujada completada");
          await onUploaded();
        } else if (failedCount === total) {
          setStatus(`Cap fitxer s’ha pogut pujar (${failedCount} errors).`);
        } else {
          setStatus(`Pujada parcial: ${total - failedCount} correctes, ${failedCount} errors.`);
          await onUploaded();
        }
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "No s’ha pogut completar la pujada.");
      } finally {
        setBusy(false);
      }
    },
    [onUploaded, ready]
  );

  if (checking) {
    return (
      <div className="dropzone dropzone--disabled">
        <p>Comprovant configuració de Supabase…</p>
        <button type="button" disabled>
          Seleccionar fitxers
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="dropzone dropzone--disabled">
        <p>
          <strong>Mode demo</strong> — la biblioteca de sota és de mostra. Per desar fotos reals al núvol, configura
          Supabase.
        </p>
        <p className="dropzone-hint">
          Crea <code>.env.local</code> (pots copiar <code>.env.example</code>) i reinicia <code>npm run dev</code>.
        </p>
        {missingEnv.length ? (
          <p className="dropzone-hint">
            Variables pendents:{" "}
            {missingEnv.map((name, idx) => (
              <span key={name}>
                <code>{name}</code>
                {idx < missingEnv.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
        ) : null}
        <button type="button" disabled>
          Pujada desactivada
        </button>
      </div>
    );
  }

  const listMaxHeight = fileRows.length > 10 ? 320 : undefined;

  return (
    <div
      className={`dropzone ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void uploadFiles(e.dataTransfer.files);
      }}
    >
      <input
        hidden
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={(e) => void uploadFiles(e.target.files)}
      />
      <p>Arrossega fotos o vídeos aquí o selecciona fitxers</p>
      <button disabled={busy} type="button" onClick={() => inputRef.current?.click()}>
        {busy ? "Pujant…" : "Seleccionar fitxers"}
      </button>
      {status ? (
        <small className={status.includes("completada") ? "status-ok" : "status-err"} style={{ display: "block", width: "100%" }}>
          {status}
          {etaText && busy ? ` · Temps estimat: ${etaText}` : null}
        </small>
      ) : null}
      {fileRows.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            margin: "10px 0 0",
            padding: 8,
            width: "100%",
            maxHeight: listMaxHeight,
            overflowY: fileRows.length > 10 ? "auto" : "visible",
            border: "1px solid #e2e6eb",
            borderRadius: 10,
            background: "#fafbfc",
            fontSize: 13
          }}
        >
          {fileRows.map((row) => (
            <li
              key={row.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "6px 4px",
                borderBottom: "1px solid #eef0f3"
              }}
            >
              <span style={{ flexShrink: 0, width: 22, textAlign: "center" }} aria-hidden>
                {row.status === "ok" ? "✓" : row.status === "error" ? "✗" : row.status === "uploading" ? "…" : "○"}
              </span>
              <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>
                <strong>{row.name}</strong>
                <span style={{ color: "var(--muted)" }}> · {formatBytes(row.size)}</span>
                {row.error ? (
                  <span style={{ display: "block", color: "#a02828", fontSize: 12 }}>{row.error}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
