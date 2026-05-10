/* eslint-disable no-console */
const { createClient } = require("@supabase/supabase-js");

function readEnv(name) {
  return (process.env[name] || "").trim();
}

async function run() {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL") || readEnv("SUPABASE_URL");
  const serviceRole = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const targetUserId = readEnv("TARGET_USER_ID");

  if (!url || !serviceRole || !targetUserId) {
    console.error("Missing env vars. Required:");
    console.error("- NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
    console.error("- SUPABASE_SERVICE_ROLE_KEY");
    console.error("- TARGET_USER_ID (uuid from auth.users.id)");
    process.exit(1);
  }

  if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
    console.error("TARGET_USER_ID must look like a UUID.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const [{ count: assetLegacy }, { count: albumLegacy }] = await Promise.all([
    supabase.from("assets").select("id", { head: true, count: "exact" }).eq("user_id", "u-1"),
    supabase.from("albums").select("id", { head: true, count: "exact" }).eq("user_id", "u-1")
  ]);

  console.log(`Legacy rows detected -> assets: ${assetLegacy || 0}, albums: ${albumLegacy || 0}`);
  if (!assetLegacy && !albumLegacy) {
    console.log("Nothing to migrate.");
    return;
  }

  const { error: upAssetsErr } = await supabase.from("assets").update({ user_id: targetUserId }).eq("user_id", "u-1");
  if (upAssetsErr) throw upAssetsErr;

  const { error: upAlbumsErr } = await supabase.from("albums").update({ user_id: targetUserId }).eq("user_id", "u-1");
  if (upAlbumsErr) throw upAlbumsErr;

  const [{ count: assetLeft }, { count: albumLeft }] = await Promise.all([
    supabase.from("assets").select("id", { head: true, count: "exact" }).eq("user_id", "u-1"),
    supabase.from("albums").select("id", { head: true, count: "exact" }).eq("user_id", "u-1")
  ]);

  console.log(`Migration done. Remaining legacy rows -> assets: ${assetLeft || 0}, albums: ${albumLeft || 0}`);
}

run().catch((err) => {
  console.error("Migration failed:", err?.message || err);
  process.exit(1);
});
