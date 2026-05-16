/**
 * POST /api/assets/[id]/edit
 *
 * Pipeline única amb Sharp (`applyImageOperationsToBuffer`), alineada amb la previsualització
 * del client (`applyOperationsToCanvas` a canvas-image-ops.ts): mateix ordre d’operacions
 * (crop, rotate, resize, filtres CSS-equivalents on calgui, blur, sharpen, autoEnhance).
 * Validació: tipus d’operació permesos i màxim `MAX_EDIT_OPERATIONS` (vegeu `@/lib/image-edit-ops`).
 */
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  isEditOperation,
  isExportOptions,
  MAX_EDIT_OPERATIONS,
  type EditOperation,
  type ExportOptions
} from "@/lib/image-edit-ops";
import {
  applyImageOperationsToBuffer,
  makeMediumWebp,
  makePreviewWebp,
  makeThumbWebp
} from "@/lib/server/apply-image-operations";
import { pickFirstAssetFile, toAsset } from "@/lib/server/asset-map";
import { ASSET_DETAIL_SELECT, ASSET_DETAIL_SELECT_LEGACY, queryWithAssetDetailSelect } from "@/lib/server/asset-row-select";
import { extractStoragePath, generateSignedUrls } from "@/lib/server/storage-utils";
import { objectPathFromSignedUrl } from "@/lib/server/signed-url-path";
import { getStorageBucket, getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { isSupabaseConfigured } from "@/lib/server/supabase-config";
import { requireAuthUserId } from "@/lib/server/require-auth-api";

const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 5;

type Body = {
  operations?: unknown[];
  export?: unknown;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

async function resolveId(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return params.id;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }

    const auth = await requireAuthUserId();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const id = await resolveId(context);
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rawOps = body.operations;
    if (!Array.isArray(rawOps)) {
      return NextResponse.json({ error: "operations must be an array" }, { status: 400 });
    }
    if (rawOps.length > MAX_EDIT_OPERATIONS) {
      return NextResponse.json({ error: `Too many operations (max ${MAX_EDIT_OPERATIONS})` }, { status: 400 });
    }

    const operations: EditOperation[] = [];
    for (const item of rawOps) {
      if (!isEditOperation(item)) {
        return NextResponse.json({ error: "Invalid operation in list" }, { status: 400 });
      }
      operations.push(item);
    }

    const defaultExport: ExportOptions = { webpQuality: 85, maxLongEdge: 0 };
    let exportOpts: ExportOptions = defaultExport;
    if (body.export !== undefined) {
      if (!isExportOptions(body.export)) {
        return NextResponse.json({ error: "Invalid export options" }, { status: 400 });
      }
      exportOpts = {
        webpQuality: Math.round(clamp(body.export.webpQuality, 40, 98)),
        maxLongEdge: Math.round(Math.max(0, Math.min(8192, body.export.maxLongEdge)))
      };
    }

    const supabase = getSupabaseAdmin();
    const bucket = getStorageBucket();

    const { data: row, error: rowErr } = await queryWithAssetDetailSelect(
      async () => supabase.from("assets").select(ASSET_DETAIL_SELECT).eq("id", id).maybeSingle(),
      async () => supabase.from("assets").select(ASSET_DETAIL_SELECT_LEGACY).eq("id", id).maybeSingle()
    );

    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (row.type !== "photo") {
      return NextResponse.json({ error: "Only photo assets can be edited" }, { status: 400 });
    }

    const fileRow = pickFirstAssetFile(row.asset_files);
    if (!fileRow || typeof fileRow.original_url !== "string") {
      return NextResponse.json({ error: "Missing asset files" }, { status: 500 });
    }

    const originalUrl = fileRow.original_url.trim();
    const previewUrl = typeof fileRow.preview_url === "string" ? fileRow.preview_url.trim() : "";
    const mediumUrlStr = typeof fileRow.medium_url === "string" ? fileRow.medium_url.trim() : "";
    const thumbUrl = typeof fileRow.thumb_url === "string" ? fileRow.thumb_url.trim() : "";

    let originalPath = objectPathFromSignedUrl(originalUrl);
    let previewPath = objectPathFromSignedUrl(previewUrl);
    let mediumPath = mediumUrlStr ? objectPathFromSignedUrl(mediumUrlStr) : null;
    let thumbPath = objectPathFromSignedUrl(thumbUrl);
    if (!originalPath || !previewPath || !thumbPath || !mediumPath) {
      try {
        const paths = extractStoragePath(row.title || "photo.jpg", fileRow.checksum);
        originalPath = originalPath ?? paths.original;
        previewPath = previewPath ?? paths.preview;
        mediumPath = mediumPath ?? paths.medium;
        thumbPath = thumbPath ?? paths.thumb;
      } catch {
        /* ignore */
      }
    }
    if (!originalPath || !previewPath || !thumbPath || !mediumPath) {
      return NextResponse.json({ error: "Could not resolve storage paths from URLs" }, { status: 500 });
    }

    const imgRes = await fetch(originalUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: `Failed to download original image (${imgRes.status})` }, { status: 502 });
    }
    const inputBuffer = Buffer.from(await imgRes.arrayBuffer());

    let edited: Buffer;
    try {
      edited = await applyImageOperationsToBuffer(inputBuffer, operations);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sharp processing failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    let outSharp = sharp(edited, { failOn: "none" });
    if (exportOpts.maxLongEdge > 0) {
      const em = await outSharp.metadata();
      const ew = em.width ?? 0;
      const eh = em.height ?? 0;
      if (ew > 0 && eh > 0 && Math.max(ew, eh) > exportOpts.maxLongEdge) {
        outSharp = outSharp.resize({
          width: exportOpts.maxLongEdge,
          height: exportOpts.maxLongEdge,
          fit: "inside",
          withoutEnlargement: true
        });
      }
    }
    const originalWebp = await outSharp.webp({ quality: exportOpts.webpQuality }).toBuffer();
    const previewBuf = await makePreviewWebp(originalWebp, 1600, 80);
    const mediumBuf = await makeMediumWebp(originalWebp, 800, 78);
    const thumbBuf = await makeThumbWebp(originalWebp, 480, 72);

    const checksum = crypto.createHash("sha256").update(originalWebp).digest("hex");
    const size = originalWebp.length;

    const { error: upOrig } = await supabase.storage.from(bucket).upload(originalPath, originalWebp, {
      contentType: "image/webp",
      upsert: true
    });
    if (upOrig) return NextResponse.json({ error: upOrig.message }, { status: 500 });

    const { error: upPrev } = await supabase.storage.from(bucket).upload(previewPath, previewBuf, {
      contentType: "image/webp",
      upsert: true
    });
    if (upPrev) return NextResponse.json({ error: upPrev.message }, { status: 500 });

    const { error: upMed } = await supabase.storage.from(bucket).upload(mediumPath, mediumBuf, {
      contentType: "image/webp",
      upsert: true
    });
    if (upMed) return NextResponse.json({ error: upMed.message }, { status: 500 });

    const { error: upThumb } = await supabase.storage.from(bucket).upload(thumbPath, thumbBuf, {
      contentType: "image/webp",
      upsert: true
    });
    if (upThumb) return NextResponse.json({ error: upThumb.message }, { status: 500 });

    const signed = await generateSignedUrls(
      bucket,
      { original: originalPath, preview: previewPath, medium: mediumPath, thumb: thumbPath },
      SIGNED_URL_TTL
    );

    const sharpMeta = await sharp(originalWebp, { failOn: "none" }).metadata();
    const width = sharpMeta.width ?? row.width;
    const height = sharpMeta.height ?? row.height;
    const uploadedAt = new Date().toISOString();

    const { error: upAsset } = await supabase
      .from("assets")
      .update({ width, height, uploaded_at: uploadedAt })
      .eq("id", id)
      .eq("user_id", userId);
    if (upAsset) return NextResponse.json({ error: upAsset.message }, { status: 500 });

    const { error: upFiles } = await supabase
      .from("asset_files")
      .update({
        original_url: signed.originalUrl,
        preview_url: signed.previewUrl,
        medium_url: signed.mediumUrl,
        thumb_url: signed.thumbUrl,
        checksum,
        size
      })
      .eq("asset_id", id);
    if (upFiles) return NextResponse.json({ error: upFiles.message }, { status: 500 });

    const { data: fresh, error: freshErr } = await queryWithAssetDetailSelect(
      async () => supabase.from("assets").select(ASSET_DETAIL_SELECT).eq("id", id).maybeSingle(),
      async () => supabase.from("assets").select(ASSET_DETAIL_SELECT_LEGACY).eq("id", id).maybeSingle()
    );

    if (freshErr || !fresh) {
      return NextResponse.json({ error: freshErr?.message ?? "Failed to reload asset" }, { status: 500 });
    }

    const asset = toAsset(fresh);
    const fileSizeMB = size / (1024 * 1024);

    return NextResponse.json({
      success: true,
      asset,
      fileSizeMB: Math.round(fileSizeMB * 1000) / 1000
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
