import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthUserIdMock = vi.fn();
const isSupabaseConfiguredMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/server/require-auth-api", () => ({
  requireAuthUserId: (...args: unknown[]) => requireAuthUserIdMock(...args)
}));

vi.mock("@/lib/server/supabase-config", () => ({
  isSupabaseConfigured: (...args: unknown[]) => isSupabaseConfiguredMock(...args)
}));

vi.mock("@/lib/server/supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: fromMock
  }))
}));

describe("POST /api/collections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores new collection with authenticated user id", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    requireAuthUserIdMock.mockResolvedValue({ userId: "user-123" });

    const insertMock = vi.fn(async () => ({ error: null }));
    fromMock.mockReturnValue({
      insert: insertMock
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Vacaciones" })
      })
    );

    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0]?.[0] as { user_id?: string; name?: string };
    expect(payload.user_id).toBe("user-123");
    expect(payload.name).toBe("Vacaciones");
  });
});
