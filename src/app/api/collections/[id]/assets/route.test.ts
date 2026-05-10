import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

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
  getSupabaseAdmin: vi.fn(() => ({ from: fromMock }))
}));

describe("/api/collections/[id]/assets auth guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST returns 401 when auth guard rejects", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    requireAuthUserIdMock.mockResolvedValue(
      NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/collections/c1/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: "a1", include: true })
      }),
      { params: Promise.resolve({ id: "c1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("POST include=false removes asset from collection", async () => {
    isSupabaseConfiguredMock.mockReturnValue(true);
    requireAuthUserIdMock.mockResolvedValue({ userId: "user-1" });

    const deleteEqAssetMock = vi.fn(async () => ({ error: null }));
    const deleteEqAlbumMock = vi.fn(() => ({ eq: deleteEqAssetMock }));
    const deleteMock = vi.fn(() => ({ eq: deleteEqAlbumMock }));

    const albumsMaybeSingleMock = vi.fn(async () => ({ data: { id: "c1" }, error: null }));
    const albumsEqUserMock = vi.fn(() => ({ maybeSingle: albumsMaybeSingleMock }));
    const albumsEqIdMock = vi.fn(() => ({ eq: albumsEqUserMock }));
    const albumsSelectMock = vi.fn(() => ({ eq: albumsEqIdMock }));

    fromMock.mockImplementation((table: string) => {
      if (table === "albums") return { select: albumsSelectMock };
      if (table === "album_assets") return { delete: deleteMock };
      return {};
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/collections/c1/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: "a1", include: false })
      }),
      { params: Promise.resolve({ id: "c1" }) }
    );
    const body = (await res.json()) as { ok?: boolean };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(deleteEqAssetMock).toHaveBeenCalledWith("asset_id", "a1");
  });
});
