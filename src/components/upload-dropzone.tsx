"use client";

import { useRef, useState } from "react";

interface Props {
  onUploaded: () => Promise<void>;
  /** undefined = encara comprovant; false = sense Supabase; true = pujada disponible */
  supabaseConfigured?: boolean;
  missingEnv?: string[];
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

export function UploadDropzone({ onUploaded, supabaseConfigured, missingEnv = [] }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const ready = supabaseConfigured === true;
  const checking = supabaseConfigured === undefined;

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length || !ready) return;
    setBusy(true);
    setStatus(`Pujant ${fileList.length} fitxer(s)...`);
    try {
      for (const file of Array.from(fileList)) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/upload", { method: "POST", body: formData });
        const payload = (await response.json()) as { error?: string; message?: string };
        if (!response.ok) {
          throw new Error(mapUploadError(payload));
        }
      }
      setStatus("Pujada completada");
      await onUploaded();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No s’ha pogut completar la pujada.");
    } finally {
      setBusy(false);
    }
  }

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
      {status ? <small className={status.includes("completada") ? "status-ok" : "status-err"}>{status}</small> : null}
    </div>
  );
}
