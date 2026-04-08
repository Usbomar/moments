"use client";

import { useRef, useState } from "react";

interface Props {
  onUploaded: () => Promise<void>;
}

export function UploadDropzone({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    setStatus(`Pujant ${fileList.length} fitxer(s)...`);
    try {
      for (const file of Array.from(fileList)) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/upload", { method: "POST", body: formData });
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "Upload failed");
        }
      }
      setStatus("Pujada completada");
      await onUploaded();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
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
      <p>Arrossega fotos/videos aquí o selecciona fitxers</p>
      <button disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Pujant..." : "Seleccionar fitxers"}
      </button>
      {status ? <small>{status}</small> : null}
    </div>
  );
}
