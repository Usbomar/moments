export type MediaType = "photo" | "video";

export interface AssetFile {
  originalUrl: string;
  previewUrl: string;
  /** ~800px WebP per visors; buit en assets antics sense migració. */
  mediumUrl?: string;
  thumbUrl: string;
  size: number;
  checksum: string;
}

/** Ubicació geocodificada; `id` és la PK de `locations` quan ve del servidor (per reutilitzar en PATCH). */
export interface LocationInfo {
  id?: number;
  lat: number;
  lng: number;
  city: string;
  country: string;
}

/**
 * Model de foto/vídeo al client (alineat amb `assets` + relacions).
 * Les dates són ISO 8601 (string), com arriben de l’API i `JSON.stringify`.
 */
export interface Asset {
  id: string;
  userId: string;
  type: MediaType;
  title: string;
  description?: string;
  /** Data presa / assignada (columna `taken_at`). */
  takenAt: string;
  /** Data de pujada o última regeneració de fitxers (`uploaded_at`). */
  uploadedAt: string;
  width: number;
  height: number;
  duration?: number;
  favorite: boolean;
  /** Si és true, la foto no es mostra als convidats (per defecte false: visible). */
  hiddenFromGuests?: boolean;
  /** Reservat: el mapatge servidor encara retorna []. */
  albumIds: string[];
  /** Reservat: el mapatge servidor encara retorna []. */
  peopleIds: string[];
  /** Tags manuals (`asset_tags.origin = 'manual'`). */
  tags: string[];
  /** Tags automàtics (`asset_tags.origin = 'auto'`); només lectura des del servidor. */
  autoTags: string[];
  /** Color #RRGGBB per la vista per colors; `null` esborra l’assignació. */
  colorHex?: string | null;
  /** Legacy (migració): to 0–359; es converteix a hex en llegir si no hi ha colorHex. */
  colorHue?: number | null;
  /** Fins a una ubicació enllaçada; `null` vol dir esborrar-la al servidor (PATCH). */
  location?: LocationInfo | null;
  files: AssetFile;
}

export interface Person {
  id: string;
  name: string;
  coverAssetId?: string;
}

export interface Album {
  id: string;
  name: string;
  coverAssetId?: string;
}
