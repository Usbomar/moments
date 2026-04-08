# Moments

Modern photo management app inspired by Apple Photos.

## Chosen stack
- Next.js + TypeScript frontend and API routes.
- PostgreSQL/Supabase-ready SQL schema in `database/schema.sql`.
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
Set these environment variables in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=moments
```

Then create the schema from `database/schema.sql` in your Supabase SQL editor.
The app now supports:
- Drag-and-drop uploader in the main UI.
- Real upload to Supabase Storage (`/api/upload`).
- Asset persistence in `assets` + `asset_files`.
- Automatic library refresh after upload (`/api/assets`).

## Next phase hooks
- `src/lib/grouping.ts` includes initial event window logic for story generation.
- `src/lib/types.ts` includes `autoTags` and `people`-ready model extensions.
- `src/app/page.tsx` has a `memories` surface prepared for advanced story mode.
