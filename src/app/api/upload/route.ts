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

    const paths = extractStoragePath(file.name, processed.checksum);

    const supabase = getSupabaseAdmin();
    const bucket = getStorageBucket();
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadedAt = new Date().toISOString();
    const mediaType: MediaType = file.type.startsWith("video/") ? "video" : "photo";
    let takenAtIso = uploadedAt;
    if (mediaType === "photo") {
      const exif = await extractExif(buffer, file.type);
      if (exif.takenAt) {
        takenAtIso = exif.takenAt.toISOString();
      }
      const coords =
        exif.latitude != null && exif.longitude != null ? `${exif.latitude},${exif.longitude}` : "none";
      console.log(
        `EXIF extracted: takenAt=${exif.takenAt?.toISOString() ?? "none"}, coordinates=${coords}, camera=${[exif.cameraManufacturer, exif.cameraModel].filter(Boolean).join(" ") || "none"}`
      );
      // GPS persistència a BD: Fase 2 (locations / asset_locations).
    }
    const { data: originalUpload, error: originalError } = await supabase.storage
      .from(bucket)
      .upload(paths.original, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (originalError) {
      return NextResponse.json({ error: originalError.message }, { status: 500 });
    }

    const id = crypto.randomUUID();
    let width = 0;
    let height = 0;
    let previewPath = originalUpload.path;
    let thumbPath = originalUpload.path;

    if (mediaType === "photo") {
      const image = sharp(buffer, { failOn: "none" });
      const metadata = await image.metadata();
      width = metadata.width ?? 0;
      height = metadata.height ?? 0;

      const previewBuffer = await sharp(buffer, { failOn: "none" })
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const thumbBuffer = await sharp(buffer, { failOn: "none" })
        .resize({ width: 480, height: 480, fit: "cover" })
        .webp({ quality: 72 })
        .toBuffer();

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
    }

    const { originalUrl, previewUrl, thumbUrl } = await generateSignedUrls(
      bucket,
      {
        original: originalUpload.path,
        preview: previewPath,
        thumb: thumbPath
      },
      SIGNED_URL_TTL
    );

    const checks = [
      ["original", originalUrl] as const,
      ["preview", previewUrl] as const,
      ["thumb", thumbUrl] as const
    ];

    for (const [label, url] of checks) {
      if (!validateSignedUrl(url)) {
        throw new Error(
          `Invalid signed URL for ${label}: missing token, too short, or malformed. length=${url.length}`
        );
      }
    }

    console.log(
      "Generated signed URLs:",
      `[original length=${originalUrl.length}]`,
      `[preview length=${previewUrl.length}]`,
      `[thumb length=${thumbUrl.length}]`
    );

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
      thumb_url: thumbUrl,
      checksum: processed.checksum,
      size: file.size
    });

    if (fileError) {
      return NextResponse.json({ error: fileError.message }, { status: 500 });
    }

    return NextResponse.json({
      id,
      originalUrl,
      previewUrl,
      thumbUrl,
      checksum: processed.checksum
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
