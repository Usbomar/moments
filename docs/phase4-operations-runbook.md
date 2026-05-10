# Phase 4 Operations Runbook

This runbook defines production-ready operational practices for Moments after Phase 4.

## 1) API Observability

- Every critical API endpoint should:
  - Generate or propagate a `requestId` (`x-request-id`).
  - Return structured error payloads with `error`, optional `message`, and `requestId`.
  - Emit structured logs (`json`) with:
    - `ts`, `level`, `route`, `requestId`, `message`
    - optional contextual fields (`detail`, `userId`, etc.)

- Initial adoption in this phase:
  - `GET /api/assets`
  - `POST /api/upload`
  - `POST /api/collections/[id]/assets`

## 2) Incident Triage Flow

1. Reproduce and capture the `requestId` from frontend response payload or response headers.
2. Search logs by `requestId`.
3. Identify `route` + `error` code.
4. Classify:
   - Auth/session issue
   - Supabase query/storage issue
   - Payload validation issue
   - Unexpected runtime exception
5. Apply fix, add regression test, deploy.

## 3) Release Checklist

Before deploying:

- `npm test` passes.
- `npm run build` passes.
- SQL migrations applied in target Supabase project.
- Auth env vars set in deployment target:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Legacy ownership migration completed if needed:
  - `npm run migrate:legacy-user` with `TARGET_USER_ID`.

After deploying:

- Smoke check:
  - login / logout
  - library load
  - upload a file
  - edit metadata
  - add/remove asset in collection
- Verify no elevated 5xx rates in logs.

## 4) Quality Gate for Next Iterations

- New API routes must include requestId observability contract.
- New production bugs must be accompanied by:
  - at least one automated test
  - structured log context for future triage
