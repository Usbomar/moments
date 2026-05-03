/**
 * Genera .env.local amb les claus del Supabase local (després de `npm run supabase:start`).
 * Requereix Docker Desktop en execució.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function parseEnvBlock(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function main() {
  let text;
  try {
    text = execSync("npx supabase@latest status -o env", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch {
    console.error(
      "No s'ha pogut obtenir l'estat de Supabase. Obre Docker Desktop, executa `npm run supabase:start` i torna a provar."
    );
    process.exit(1);
  }

  const vars = parseEnvBlock(text);
  const apiUrl = vars.API_URL;
  const serviceKey = vars.SERVICE_ROLE_KEY;

  if (!apiUrl || !serviceKey) {
    console.error("Sortida inesperada de `supabase status`. Claus trobades:", Object.keys(vars));
    process.exit(1);
  }

  const body = [
    `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    "SUPABASE_STORAGE_BUCKET=fotos",
    ""
  ].join("\n");

  fs.writeFileSync(path.join(root, ".env.local"), body, "utf8");
  console.log("Creat .env.local (no es puja a Git). Reinicia `npm run dev`.");
}

main();
