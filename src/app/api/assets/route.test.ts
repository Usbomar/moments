import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const requireAuthUserIdMock = vi.fn();
const isSupabaseConfiguredMock = vi.fn();

vi.mock("@/lib/server/require-auth-api", () => ({
  requireAuthUserId: (...args: unknown[]) => requireAuthUserIdMock(...args)
}));

vi.mock("@/lib/server/supabase-config", () => ({
  isSupabaseConfigured: (...args: unknown[]) => isSupabaseConfiguredMock(...args)
}));

vi.mock("@/lib/server/supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error("Should not be called in unauthorized test");
  })
}));

describe("GET /api/assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when auth guard rejects", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    requireAuthUserIdMock.mockResolvedValue(
      NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/assets?limit=50&offset=0"));
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(401);
    expect(body.error).toBe("UNAUTHORIZED");
  });
});
