import crypto from "node:crypto";

export interface PipelineInput {
  filename: string;
  size: number;
  mimeType: string;
}

export interface PipelineOutput {
  checksum: string;
  thumbPath: string;
  previewPath: string;
  originalPath: string;
}

export async function processUpload(input: PipelineInput): Promise<PipelineOutput> {
  const checksum = crypto.createHash("sha256").update(`${input.filename}:${input.size}`).digest("hex");
  const base = checksum.slice(0, 12);
  return {
    checksum,
    originalPath: `original/${base}-${input.filename}`,
    previewPath: `preview/${base}.webp`,
    thumbPath: `thumb/${base}.webp`
  };
}
