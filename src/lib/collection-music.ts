export type CollectionMusicSource = "uploaded" | "linked";

export type CollectionMusicTrack = {
  id: string;
  title: string;
  source: CollectionMusicSource;
  url: string;
  storagePath: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  createdAt: string;
};

export function formatMusicDuration(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds ?? NaN) || !seconds || seconds <= 0) return "Durada desconeguda";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatMusicSize(bytes: number | null | undefined): string {
  if (!Number.isFinite(bytes ?? NaN) || !bytes || bytes <= 0) return "No ocupa storage";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}
