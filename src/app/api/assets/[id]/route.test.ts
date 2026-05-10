import { beforeEach, describe, expect, it, vi } from "vitest";
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
    throw new Error("Supabase admin should not be called when unauthorized");
  }),
  getStorageBucket: vi.fn(() => "fotos")
}));

describe("/api/assets/[id] auth guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PATCH returns 401 when auth guard rejects", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    requireAuthUserIdMock.mockResolvedValue(
      NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/api/assets/a1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test" })
      }),
      { params: Promise.resolve({ id: "a1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("DELETE returns 401 when auth guard rejects", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    requireAuthUserIdMock.mockResolvedValue(
      NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );

    const { DELETE } = await import("./route");
    const res = await DELETE(
      new Request("http://localhost/api/assets/a1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "a1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("PATCH returns 400 when title is missing", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    requireAuthUserIdMock.mockResolvedValue({ userId: "user-1" });

    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/api/assets/a1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "   " })
      }),
      { params: Promise.resolve({ id: "a1" }) }
    );
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain("title");
  });
});
