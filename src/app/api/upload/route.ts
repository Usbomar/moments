import crypto from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { processUpload } from "@/lib/pipeline";
import { getStorageBucket, getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { MediaType } from "@/lib/types";

const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 5;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file field" }, { status: 400 });
    }

    const processed = await processUpload({
      filename: file.name,
      size: file.size,
      mimeType: file.type
    });

    const supabase = getSupabaseAdmin();
    const bucket = getStorageBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { data: originalUpload, error: originalError } = await supabase.storage
      .from(bucket)
      .upload(processed.originalPath, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (originalError) {
      return NextResponse.json({ error: originalError.message }, { status: 500 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const mediaType: MediaType = file.type.startsWith("video/") ? "video" : "photo";
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
        .upload(processed.previewPath, previewBuffer, {
          contentType: "image/webp",
          upsert: false
        });
      if (previewError) {
        return NextResponse.json({ error: previewError.message }, { status: 500 });
      }
      previewPath = previewUpload.path;

      const { data: thumbUpload, error: thumbError } = await supabase.storage
        .from(bucket)
        .upload(processed.thumbPath, thumbBuffer, {
          contentType: "image/webp",
          upsert: false
        });
      if (thumbError) {
        return NextResponse.json({ error: thumbError.message }, { status: 500 });
      }
      thumbPath = thumbUpload.path;
    }

    const [{ data: originalSigned }, { data: previewSigned }, { data: thumbSigned }] = await Promise.all([
      supabase.storage.from(bucket).createSignedUrl(originalUpload.path, SIGNED_URL_TTL),
      supabase.storage.from(bucket).createSignedUrl(previewPath, SIGNED_URL_TTL),
      supabase.storage.from(bucket).createSignedUrl(thumbPath, SIGNED_URL_TTL)
    ]);

    const originalUrl = originalSigned?.signedUrl;
    const previewUrl = previewSigned?.signedUrl;
    const thumbUrl = thumbSigned?.signedUrl;
    if (!originalUrl || !previewUrl || !thumbUrl) {
      return NextResponse.json({ error: "Could not generate signed URLs" }, { status: 500 });
    }

    const { error: assetError } = await supabase.from("assets").insert({
      id,
      user_id: "u-1",
      type: mediaType,
      title: file.name,
      taken_at: now,
      uploaded_at: now,
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
