import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireAuthUserIdMock = vi.fn();
const isSupabaseConfiguredMock = vi.fn();
const processUploadMock = vi.fn();

vi.mock("@/lib/server/require-auth-api", () => ({
  requireAuthUserId: (...args: unknown[]) => requireAuthUserIdMock(...args)
}));

vi.mock("@/lib/server/supabase-config", () => ({
  isSupabaseConfigured: (...args: unknown[]) => isSupabaseConfiguredMock(...args)
}));

vi.mock("@/lib/pipeline", () => ({
  processUpload: (...args: unknown[]) => processUploadMock(...args)
}));

vi.mock("@/lib/server/supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error("Supabase admin should not be called when unauthorized");
  }),
  getStorageBucket: vi.fn(() => "fotos")
}));

describe("/api/upload auth guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 before processing upload when auth guard rejects", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    requireAuthUserIdMock.mockResolvedValue(
      NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );

    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" }));

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/upload", { method: "POST", body: form }));
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(401);
    expect(body.error).toBe("UNAUTHORIZED");
    expect(processUploadMock).not.toHaveBeenCalled();
  });

  it("returns 400 when file field is missing", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    requireAuthUserIdMock.mockResolvedValue({ userId: "user-1" });

    const form = new FormData();
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/upload", { method: "POST", body: form }));
    const body = (await res.json()) as { error?: string; message?: string };

    expect(res.status).toBe(400);
    expect(body.error).toBe("MISSING_FILE_FIELD");
    expect(body.message).toContain("Missing file field");
  });
});
