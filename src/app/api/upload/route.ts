import { NextResponse } from "next/server";
import { processUpload } from "@/lib/pipeline";

export async function POST(request: Request) {
  const body = (await request.json()) as { filename?: string; size?: number; mimeType?: string };
  if (!body.filename || !body.size || !body.mimeType) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const processed = await processUpload({
    filename: body.filename,
    size: body.size,
    mimeType: body.mimeType
  });

  return NextResponse.json({
    uploadUrl: `https://storage.example.com/upload/${processed.originalPath}`,
    ...processed
  });
}
