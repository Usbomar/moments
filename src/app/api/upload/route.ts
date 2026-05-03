import crypto from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { processUpload } from "@/lib/pipeline";
import { getStorageBucket, getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import {
  extractStoragePath,
  generateSignedUrls,
  validateSignedUrl
} from "@/lib/server/storage-utils";
import { extractExif } from "@/lib/exif-extractor";
import type { MediaType } from "@/lib/types";

const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 5;

/** Qualitat WebP segons el costat llarg de sortida (px). */
function webpQualityForOutputEdge(edge: number): number {
  const e = Math.max(1, Math.round(edge));
  if (e <= 480) return 72;
  if (e < 900) return 78;
  if (e < 1400) return 80;
  return 82;
}

function fullSizePhotoWebpQuality(maxDim: number, sourceFileBytes: number): number {
  const base = maxDim < 500 ? 78 : maxDim < 1000 ? 82 : maxDim < 2000 ? 86 : 88;
  return sourceFileBytes > 5_000_000 ? Math.max(68, base - 8) : base;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file field" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          error: "SUPABASE_NOT_CONFIGURED",
          message:
            "Supabase no està configurat. Crea un fitxer .env.local amb NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL) i SUPABASE_SERVICE_ROLE_KEY (veure .env.example)."
        },
        { status: 503 }
      );
    }

    const processed = await processUpload({
      filename: file.name,
      size: file.size,
      mimeType: file.type
    });

    const supabase = getSupabaseAdmin();
    const forceRaw = form.get("force");
    const force =
      forceRaw === "true" ||
      forceRaw === "1" ||
      (typeof forceRaw === "string" && forceRaw.toLowerCase() === "true");

    if (!force) {
      const { data: dupRow, error: dupErr } = await supabase
        .from("asset_files")
        .select("asset_id")
        .eq("checksum", processed.checksum)
        .limit(1)
        .maybeSingle();

      if (dupErr) {
        return NextResponse.json({ error: dupErr.message }, { status: 500 });
      }
      if (dupRow?.asset_id) {
        return NextResponse.json(
          {
            error: `This photo already exists (ID: ${dupRow.asset_id}). Upload cancelled.`,
            isDuplicate: true,
            duplicateAssetId: dupRow.asset_id
          },
          { status: 409 }
        );
      }
    }

    const paths = extractStoragePath(file.name, processed.checksum);

    const bucket = getStorageBucket();
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadedAt = new Date().toISOString();
    const mediaType: MediaType = file.type.startsWith("video/") ? "video" : "photo";
    let takenAtIso = uploadedAt;

    const id = crypto.randomUUID();
    let width = 0;
    let height = 0;
    let previewPath = paths.preview;
    let mediumPath = paths.medium;
    let thumbPath = paths.thumb;
    let uploadBody: Buffer = buffer;
    let originalContentType = file.type;
    let storedSize = file.size;

    if (mediaType === "photo") {
      const exif = await extractExif(buffer, file.type);
      if (exif.takenAt) {
        takenAtIso = exif.takenAt.toISOString();
      }

      const oriented = await sharp(buffer, { failOn: "none" }).rotate().toBuffer();
      const meta = await sharp(oriented).metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
      const maxDim = Math.max(width, height, 1);
      const fullQ = fullSizePhotoWebpQuality(maxDim, file.size);

      uploadBody = await sharp(oriented, { failOn: "none" }).webp({ quality: fullQ }).toBuffer();
      originalContentType = "image/webp";
      storedSize = uploadBody.length;

      const base = sharp(oriented, { failOn: "none" });
      const thumbBuffer = await base
        .clone()
        .resize({ width: 480, height: 480, fit: "cover" })
        .webp({ quality: 72 })
        .toBuffer();
      const mediumBuffer = await base
        .clone()
        .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
        .webp({ quality: webpQualityForOutputEdge(800) })
        .toBuffer();
      const previewBuffer = await base
        .clone()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: webpQualityForOutputEdge(1600) })
        .toBuffer();

      const { data: originalUpload, error: originalError } = await supabase.storage
        .from(bucket)
        .upload(paths.original, uploadBody, {
          contentType: originalContentType,
          upsert: false
        });

      if (originalError) {
        return NextResponse.json({ error: originalError.message }, { status: 500 });
      }

      const { data: previewUpload, error: previewError } = await supabase.storage
        .from(bucket)
        .upload(paths.preview, previewBuffer, {
          contentType: "image/webp",
          upsert: false
        });
      if (previewError) {
        return NextResponse.json({ error: previewError.message }, { status: 500 });
      }
      previewPath = previewUpload.path;

      const { data: mediumUpload, error: mediumError } = await supabase.storage
        .from(bucket)
        .upload(paths.medium, mediumBuffer, {
          contentType: "image/webp",
          upsert: false
        });
      if (mediumError) {
        return NextResponse.json({ error: mediumError.message }, { status: 500 });
      }
      mediumPath = mediumUpload.path;

      const { data: thumbUpload, error: thumbError } = await supabase.storage
        .from(bucket)
        .upload(paths.thumb, thumbBuffer, {
          contentType: "image/webp",
          upsert: false
        });
      if (thumbError) {
        return NextResponse.json({ error: thumbError.message }, { status: 500 });
      }
      thumbPath = thumbUpload.path;

      const { originalUrl, previewUrl, mediumUrl, thumbUrl } = await generateSignedUrls(
        bucket,
        {
          original: originalUpload.path,
          preview: previewPath,
          medium: mediumPath,
          thumb: thumbPath
        },
        SIGNED_URL_TTL
      );

      const checks = [
        ["original", originalUrl] as const,
        ["preview", previewUrl] as const,
        ["medium", mediumUrl] as const,
        ["thumb", thumbUrl] as const
      ];

      for (const [label, url] of checks) {
        if (!validateSignedUrl(url)) {
          throw new Error(
            `Invalid signed URL for ${label}: missing token, too short, or malformed. length=${url.length}`
          );
        }
      }

      const { error: assetError } = await supabase.from("assets").insert({
        id,
        user_id: "u-1",
        type: mediaType,
        title: file.name,
        taken_at: takenAtIso,
        uploaded_at: uploadedAt,
        width,
        height,
        duration: null,
        favorite: false
      });

      if (assetError) {
        return NextResponse.json({ error: assetError.message }, { status: 500 });
      }

      const { error: fileError } = await supabase.from("asset_files").insert({
        asset_id: id,
        original_url: originalUrl,
        preview_url: previewUrl,
        medium_url: mediumUrl,
        thumb_url: thumbUrl,
        checksum: processed.checksum,
        size: storedSize
      });

      if (fileError) {
        return NextResponse.json({ error: fileError.message }, { status: 500 });
      }

      return NextResponse.json({
        id,
        originalUrl,
        previewUrl,
        mediumUrl,
        thumbUrl,
        checksum: processed.checksum,
        isDuplicate: false
      });
    }

    /* --- Vídeo: un sol objecte original; mateix path per URL signades derivades --- */
    const { data: originalUpload, error: originalError } = await supabase.storage
      .from(bucket)
      .upload(paths.original, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (originalError) {
      return NextResponse.json({ error: originalError.message }, { status: 500 });
    }

    previewPath = originalUpload.path;
    mediumPath = originalUpload.path;
    thumbPath = originalUpload.path;

    const { originalUrl, previewUrl, mediumUrl, thumbUrl } = await generateSignedUrls(
      bucket,
      {
        original: originalUpload.path,
        preview: previewPath,
        medium: mediumPath,
        thumb: thumbPath
      },
      SIGNED_URL_TTL
    );

    const checks = [
      ["original", originalUrl] as const,
      ["preview", previewUrl] as const,
      ["medium", mediumUrl] as const,
      ["thumb", thumbUrl] as const
    ];

    for (const [label, url] of checks) {
      if (!validateSignedUrl(url)) {
        throw new Error(
          `Invalid signed URL for ${label}: missing token, too short, or malformed. length=${url.length}`
        );
      }
    }

    const { error: assetError } = await supabase.from("assets").insert({
      id,
      user_id: "u-1",
      type: mediaType,
      title: file.name,
      taken_at: takenAtIso,
      uploaded_at: uploadedAt,
      width,
      height,
      duration: null,
      favorite: false
    });

    if (assetError) {
      return NextResponse.json({ error: assetError.message }, { status: 500 });
    }

    const { error: fileError } = await supabase.from("asset_files").insert({
      asset_id: id,
      original_url: originalUrl,
      preview_url: previewUrl,
      medium_url: mediumUrl,
      thumb_url: thumbUrl,
      checksum: processed.checksum,
      size: storedSize
    });

    if (fileError) {
      return NextResponse.json({ error: fileError.message }, { status: 500 });
    }

    return NextResponse.json({
      id,
      originalUrl,
      previewUrl,
      mediumUrl,
      thumbUrl,
      checksum: processed.checksum,
      isDuplicate: false
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
