import piexif from "piexifjs";

/**
 * Les dades EXIF es llegeixen del buffer original abans de la pujada.
 * A `/api/upload`, les imatges es re-codifiquen a WebP amb Sharp (per defecte sense EXIF als derivats);
 * la data i GPS es poden persistir a la base de dades via aquest extractor abans de la pèrdua als píxels.
 */

/** Shape returned by `piexif.load` (JPEG). */
type LoadedExif = ReturnType<typeof piexif.load>;

export interface ExifData {
  takenAt?: Date;
  latitude?: number;
  longitude?: number;
  cameraModel?: string;
  cameraManufacturer?: string;
}

/** EXIF datetime: `YYYY:MM:DD HH:mm:ss` (local time per camera). */
export function parseDatetime(exifDate: string | undefined | null): Date | undefined {
  if (exifDate == null || typeof exifDate !== "string") return undefined;
  const t = exifDate.trim();
  if (!t) return undefined;
  // "2024:01:15 14:30:00" -> ISO-like parseable string
  const normalized = t.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function rationalToNumber(pair: unknown): number {
  if (Array.isArray(pair) && pair.length === 2) {
    const n = Number(pair[0]);
    const d = Number(pair[1]);
    if (Number.isFinite(n) && Number.isFinite(d) && d !== 0) return n / d;
    if (Number.isFinite(n) && d === 0) return n;
  }
  return NaN;
}

/**
 * Converts EXIF GPS IFD values (degrees as rationals + ref N/S/E/W) to WGS84 decimal degrees.
 */
export function formatGPSCoordinates(gpsData: Record<number, unknown> | undefined | null): {
  latitude?: number;
  longitude?: number;
} {
  if (!gpsData || typeof gpsData !== "object") return {};

  const latRef = String(gpsData[piexif.GPSIFD.GPSLatitudeRef] ?? "").trim().toUpperCase();
  const lonRef = String(gpsData[piexif.GPSIFD.GPSLongitudeRef] ?? "").trim().toUpperCase();
  const latDms = gpsData[piexif.GPSIFD.GPSLatitude] as unknown;
  const lonDms = gpsData[piexif.GPSIFD.GPSLongitude] as unknown;

  const lat = dmsRationalsToDecimal(latDms, latRef === "S" ? "S" : "N");
  const lon = dmsRationalsToDecimal(lonDms, lonRef === "W" ? "W" : "E");

  const out: { latitude?: number; longitude?: number } = {};
  if (lat != null && Number.isFinite(lat)) out.latitude = lat;
  if (lon != null && Number.isFinite(lon)) out.longitude = lon;
  return out;
}

function dmsRationalsToDecimal(dms: unknown, ref: "N" | "S" | "E" | "W"): number | undefined {
  if (!Array.isArray(dms) || dms.length < 3) return undefined;
  const deg = rationalToNumber(dms[0]);
  const min = rationalToNumber(dms[1]);
  const sec = rationalToNumber(dms[2]);
  if (!Number.isFinite(deg)) return undefined;
  let dec = deg + (Number.isFinite(min) ? min : 0) / 60 + (Number.isFinite(sec) ? sec : 0) / 3600;
  if (ref === "S" || ref === "W") dec = -dec;
  return dec;
}

function isJpegBuffer(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/** HEIC/HEIF use ISO BMFF `ftyp`; piexif only supports JPEG APP1 EXIF. */
function isLikelyHeicOrHeif(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const ftyp = buf.slice(4, 8).toString("ascii");
  if (ftyp !== "ftyp") return false;
  const brand = buf.slice(8, 12).toString("ascii").toLowerCase();
  return /heic|heix|hevc|heim|heis|mif1|msf1|avif/.test(brand);
}

function readStringTag(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function pickTakenAt(exif: LoadedExif): Date | undefined {
  const exifIfd = exif.Exif ?? {};
  const zeroth = exif["0th"] ?? {};

  const original = readStringTag(exifIfd[piexif.ExifIFD.DateTimeOriginal]);
  const digitized = readStringTag(exifIfd[piexif.ExifIFD.DateTimeDigitized]);
  const dt0 = readStringTag(zeroth[piexif.ImageIFD.DateTime]);

  return (
    parseDatetime(original) ?? parseDatetime(digitized) ?? parseDatetime(dt0)
  );
}

function pickCamera(exif: LoadedExif): Pick<ExifData, "cameraManufacturer" | "cameraModel"> {
  const zeroth = exif["0th"] ?? {};
  return {
    cameraManufacturer: readStringTag(zeroth[piexif.ImageIFD.Make]),
    cameraModel: readStringTag(zeroth[piexif.ImageIFD.Model])
  };
}

/**
 * Reads EXIF from a photo buffer. **JPEG** is fully supported via piexifjs.
 * **HEIC/HEIF** and **PNG** are not parsed here (different containers / no APP1); returns partial/empty metadata.
 */
export async function extractExif(buffer: Buffer, mimeType?: string): Promise<ExifData> {
  return Promise.resolve().then(() => extractExifSync(buffer, mimeType));
}

function extractExifSync(buffer: Buffer, mimeType?: string): ExifData {
  const lower = (mimeType ?? "").toLowerCase();
  if (lower.includes("png")) {
    return {};
  }
  if (lower.includes("heic") || lower.includes("heif") || isLikelyHeicOrHeif(buffer)) {
    // Phase 2: integrate heic-decode / exiftool-sidecar if needed.
    return {};
  }
  if (!isJpegBuffer(buffer)) {
    return {};
  }

  try {
    const binary = buffer.toString("binary");
    const exif = piexif.load(binary);

    const takenAt = pickTakenAt(exif);
    const { cameraManufacturer, cameraModel } = pickCamera(exif);
    const gpsBlock = exif.GPS as Record<number, unknown> | undefined;
    const { latitude, longitude } = formatGPSCoordinates(gpsBlock ?? null);

    const out: ExifData = {};
    if (takenAt) out.takenAt = takenAt;
    if (latitude != null) out.latitude = latitude;
    if (longitude != null) out.longitude = longitude;
    if (cameraManufacturer) out.cameraManufacturer = cameraManufacturer;
    if (cameraModel) out.cameraModel = cameraModel;
    return out;
  } catch {
    return {};
  }
}
