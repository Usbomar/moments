/**
 * Fragment PostgREST compartit per carregar un asset amb fitxers, ubicació (amb id de `locations`) i tags.
 */
const ASSET_DETAIL_BASE =
  "id,user_id,type,title,description,taken_at,uploaded_at,width,height,duration,favorite,hidden_from_guests" as const;

const ASSET_DETAIL_RELATIONS =
  "asset_files(original_url,preview_url,medium_url,thumb_url,checksum,size),asset_locations(location_id,locations(id,lat,lng,city,country)),asset_tags(tag,origin)" as const;

/** Sense color_hex (abans de la migració SQL). */
export const ASSET_DETAIL_SELECT_LEGACY =
  `${ASSET_DETAIL_BASE},color_hue,${ASSET_DETAIL_RELATIONS}` as const;

/** Amb color #RRGGBB (requereix migració `20260516120000_assets_color_hex.sql`). */
export const ASSET_DETAIL_SELECT =
  `${ASSET_DETAIL_BASE},color_hue,color_hex,${ASSET_DETAIL_RELATIONS}` as const;

export function isMissingColorHexColumn(message: string): boolean {
  return /color_hex/i.test(message);
}

type QueryResult<T> = { data: T; error: { message: string } | null };

/**
 * Consulta amb columnes completes; si falta `color_hex` a la BD, repeteix sense aquesta columna.
 */
export async function queryWithAssetDetailSelect<T>(
  runFull: () => Promise<QueryResult<T>>,
  runLegacy: () => Promise<QueryResult<T>>
): Promise<QueryResult<T>> {
  const first = await runFull();
  if (!first.error || !isMissingColorHexColumn(first.error.message)) return first;
  return runLegacy();
}
