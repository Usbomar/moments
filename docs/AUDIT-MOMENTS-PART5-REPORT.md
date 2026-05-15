# Moments — Auditoria Part 5/5: Fixes i informe final

Data: 2026-05-15

## Problemes detectats (resum)

| # | Problema | Impacte | Severitat |
|---|-----------|---------|------------|
| 1 | Resposta `PATCH /api/assets/[id]` sense `color_hue` al `select` | `colorHue` inconsistent fins al següent `GET` | Alta |
| 2 | PhotoModal tancava sempre després de desar encara si el `PATCH` fallava | L’usuari creu que s’ha desat; pèrdua aparent de dades | Alta |
| 3 | Ubicació buida: `JSON.stringify` ometia `location` → el servidor no rebia `null` i no esborrava la ubicació | No es podia treure la ubicació des del modal | Crítica |
| 4 | Cada canvi d’ubicació insertava una fila nova a `locations` sense netejar la vella | Acumulació de files `locations` òrfenes | Mitjana |
| 5 | `GET /api/assets` feia una segona query només per `color_hue` | Latència i duplicació de lògica | Baixa |
| 6 | Tipus `Asset` sense `id` de ubicació ni `null` explícit per esborrar | Model incomplet respecte a la BD | Mitjana |

## Fixes aplicats

1. **`ASSET_DETAIL_SELECT`** (`src/lib/server/asset-row-select.ts`): select únic amb `color_hue`, `locations(id,lat,lng,city,country)` i relacions existents.
2. **`GET /api/assets`** i **`GET /api/guest/[slug]/assets`**: usen `ASSET_DETAIL_SELECT`; eliminat el segon round-trip de `color_hue`.
3. **`PATCH /api/assets/[id]`** i **`POST .../edit` (reload)**: `select` final amb `ASSET_DETAIL_SELECT`; validació `lat`/`lng`; reutilització de `locations.id` si el client l’envia; neteja de `locations` òrfenes quan canvia o s’esborra l’enllaç.
4. **`toAsset` / `LocationInfo`**: exposa `id` de `locations` al client; `pickFirstLocationLink` centralitza la lectura de l’embed.
5. **`src/lib/types.ts`**: `Asset` documentat; `location` pot ser `null` per PATCH; `LocationInfo.id?`.
6. **`PhotoModal`**: `location = null` quan el camp està buit; `try/catch` al voltant de `onSave`; no es tanca el modal si hi ha error.
7. **`page.tsx`**: `onPhotoSave` llança error si el `PATCH` falla; cos del `PATCH` només inclou `location` si l’objecte `updated` té la propietat `location` (evita sobreescriure sense voler); `onQuickUpdate` amb `try/catch` i `refreshLibrary` en fallada; favorit amb `try/catch`.

## Fitxers modificats / nous

- `src/lib/server/asset-row-select.ts` (nou)
- `src/lib/types.ts`
- `src/lib/server/asset-map.ts`
- `src/app/api/assets/route.ts`
- `src/app/api/assets/[id]/route.ts`
- `src/app/api/assets/[id]/edit/route.ts`
- `src/app/api/guest/[slug]/assets/route.ts`
- `src/components/PhotoModal.tsx`
- `src/app/page.tsx`
- `docs/AUDIT-MOMENTS-PART5-REPORT.md` (aquest document)

## No implementat (abast explícit)

- Refactor global a Context / React Query (`TASK 5.6` complet).
- `edited_at` a la BD (no existeix columna).
- Canvi de `takenAt`/`uploadedAt` a tipus `Date` al client (trencaria tot el flux JSON actual).

## Checklist de verificació manual

- [ ] Obrir PhotoModal, canviar títol i desar → modal es tanca; graella actualitzada.
- [ ] Desar amb error (p. ex. títol buit o API fora) → missatge d’error; **modal obert**.
- [ ] Esborrar text d’ubicació i desar → després de refrescar, la foto **sense** ubicació.
- [ ] Desar ubicació amb mapa/geocode → PC B després de **refrescar** veu la mateixa ubicació (comportament esperat sense realtime).
- [ ] Consola del navegador sense errors en flux normal.
- [ ] Xarxa: un `PATCH` al desar foto; després opcionalment `GET /api/assets` (refresh).
