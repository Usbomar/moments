import { NextResponse } from "next/server";

type LogLevel = "info" | "warn" | "error";

export function getRequestId(request: Request): string {
  const fromHeader = request.headers.get("x-request-id")?.trim();
  if (fromHeader) return fromHeader;
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function logApi(
  level: LogLevel,
  route: string,
  requestId: string,
  message: string,
  extra?: Record<string, unknown>
) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    route,
    requestId,
    message,
    ...extra
  };
  const text = JSON.stringify(payload);
  if (level === "error") {
    console.error(text);
  } else if (level === "warn") {
    console.warn(text);
  } else {
    console.info(text);
  }
}

export function errorJson(
  status: number,
  requestId: string,
  error: string,
  message?: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error,
      message,
      requestId,
      ...extra
    },
    {
      status,
      headers: { "x-request-id": requestId }
    }
  );
}

export function okJson<T>(requestId: string, body: T, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "x-request-id": requestId }
  });
}
