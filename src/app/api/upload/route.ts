import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { processUpload } from "@/lib/pipeline";
import { getStorageBucket, getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { MediaType } from "@/lib/types";

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
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(processed.originalPath, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: signedData } = await supabase.storage
      .from(bucket)
      .createSignedUrl(uploadData.path, 60 * 60 * 24 * 365 * 5);

    const publicUrl = signedData?.signedUrl;
    if (!publicUrl) {
      return NextResponse.json({ error: "Could not generate signed URL" }, { status: 500 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const mediaType: MediaType = file.type.startsWith("video/") ? "video" : "photo";

    const { error: assetError } = await supabase.from("assets").insert({
      id,
      user_id: "u-1",
      type: mediaType,
      title: file.name,
      taken_at: now,
      uploaded_at: now,
      width: 0,
      height: 0,
      duration: null,
      favorite: false
    });

    if (assetError) {
      return NextResponse.json({ error: assetError.message }, { status: 500 });
    }

    const { error: fileError } = await supabase.from("asset_files").insert({
      asset_id: id,
      original_url: publicUrl,
      preview_url: publicUrl,
      thumb_url: publicUrl,
      checksum: processed.checksum,
      size: file.size
    });

    if (fileError) {
      return NextResponse.json({ error: fileError.message }, { status: 500 });
    }

    return NextResponse.json({
      id,
      originalUrl: publicUrl,
      previewUrl: publicUrl,
      thumbUrl: publicUrl,
      checksum: processed.checksum
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
