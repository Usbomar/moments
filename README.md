# Moments

Modern photo management app inspired by Apple Photos.

## Chosen stack
- Next.js + TypeScript frontend and API routes.
- PostgreSQL/Supabase-ready SQL schema in `database/schema.sql` and `supabase/migrations/` (CLI).
- S3-compatible storage design via upload pipeline.
- Mixed privacy model: cloud processing for previews/indexes with future opt-out controls.

## Implemented MVP scope
- Fast photo/video library grid with lazy image loading.
- Timeline grouping by month.
- Albums and favorites views.
- Basic search (query by title/tag/city).
- Fullscreen viewer with keyboard navigation.
- Upload processing API contract and thumbnail path pipeline.

## Run locally
```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Configure Supabase storage and DB
Without `.env.local`, the app runs in **demo mode**: sample library only, uploads disabled, with Catalan UI hints instead of raw errors.

### Opció A — Supabase local (recomanat per desenvolupar)
1. Instal·la [Docker Desktop](https://docs.docker.com/desktop) i arrenca’l.
2. Des de la carpeta del projecte:
   ```bash
   npm run supabase:start
   npm run env:local
   ```
   Això crea `.env.local` (no es puja a Git) amb `NEXT_PUBLIC_SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` del stack local.
3. Les migracions de `supabase/migrations/` s’apliquen en arrencar el stack (taula + bucket `moments`).
4. Reinicia l’app: `npm run dev`.

### Opció B — Supabase al núvol (producció / sense Docker)
1. Crea un projecte a [https://supabase.com](https://supabase.com).
2. A **Settings → API**, copia **Project URL** i **service_role** (secret).
3. Crea `.env.local` a l’arrel del projecte:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=moments
```

4. Executa el SQL de `database/schema.sql` (o el de `supabase/migrations/`) a l’SQL editor de Supabase.
5. A **Storage**, crea el bucket `moments` (o deixa que el SQL de `supabase/migrations` el creï si l’executes sencer).
6. Reinicia `npm run dev`.

The app now supports:
- Drag-and-drop uploader in the main UI.
- Real upload to Supabase Storage (`/api/upload`).
- Asset persistence in `assets` + `asset_files`.
- Real image variants generation (preview + thumb in WebP).
- Automatic library refresh after upload (`/api/assets`).

## Next phase hooks
- `src/lib/grouping.ts` includes initial event window logic for story generation.
- `src/lib/types.ts` includes `autoTags` and `people`-ready model extensions.
- `src/app/page.tsx` has a `memories` surface prepared for advanced story mode.
