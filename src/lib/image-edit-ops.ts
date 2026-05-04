/** Image edit operations: client preview + server Sharp pipeline (same order). */

export type EditOperation =
  | { type: "crop"; x: number; y: number; width: number; height: number }
  | { type: "rotate"; angle: 0 | 90 | 180 | 270 }
  | { type: "resize"; width: number; height: number; maintainAspect: boolean }
  | { type: "brightness"; value: number }
  | { type: "contrast"; value: number }
  | { type: "saturation"; value: number }
  | { type: "blur"; value: number }
  | { type: "sharpen"; value: number }
  /** Paquet d’ajustos en un sol pas d’historial (mateix ordre que ops individuals). */
  | {
      type: "adjustmentBatch";
      brightness: number;
      contrast: number;
      saturation: number;
      blur: number;
      sharpen: number;
    }
  | {
      type: "autoEnhance";
      brightness: number;
      contrast: number;
      saturation: number;
      sharpen: number;
      /** Si es defineix (>0), redueix la mida màxima (px costat llarg) per alleugerar el fitxer. */
      targetMaxEdge?: number;
    };

export const EDIT_OPERATION_TYPES: EditOperation["type"][] = [
  "crop",
  "rotate",
  "resize",
  "brightness",
  "contrast",
  "saturation",
  "blur",
  "sharpen",
  "adjustmentBatch",
  "autoEnhance"
];

export const MAX_EDIT_OPERATIONS = 20;
export const MAX_EDIT_HISTORY_CLIENT = 10;

export type ExportOptions = {
  webpQuality: number;
  /** 0 = sense redimensionament extra abans del WebP */
  maxLongEdge: number;
};

export function isEditOperation(value: unknown): value is EditOperation {
  if (!value || typeof value !== "object") return false;
  const t = (value as { type?: string }).type;
  if (typeof t !== "string" || !EDIT_OPERATION_TYPES.includes(t as EditOperation["type"])) return false;
  const o = value as Record<string, unknown>;
  switch (t) {
    case "crop":
      return [o.x, o.y, o.width, o.height].every((n) => typeof n === "number" && Number.isFinite(n));
    case "rotate":
      return o.angle === 0 || o.angle === 90 || o.angle === 180 || o.angle === 270;
    case "resize":
      return (
        typeof o.width === "number" &&
        typeof o.height === "number" &&
        Number.isFinite(o.width) &&
        Number.isFinite(o.height) &&
        typeof o.maintainAspect === "boolean"
      );
    case "brightness":
    case "contrast":
    case "saturation":
      return typeof o.value === "number" && Number.isFinite(o.value);
    case "blur":
      return typeof o.value === "number" && o.value >= 0 && o.value <= 20;
    case "sharpen":
      return typeof o.value === "number" && o.value >= 0 && o.value <= 100;
    case "adjustmentBatch": {
      const nums = ["brightness", "contrast", "saturation", "blur", "sharpen"] as const;
      if (!nums.every((k) => typeof o[k] === "number" && Number.isFinite(o[k] as number))) return false;
      const b = o.brightness as number;
      const c = o.contrast as number;
      const s = o.saturation as number;
      const blur = o.blur as number;
      const sharpen = o.sharpen as number;
      return (
        b >= -100 &&
        b <= 100 &&
        c >= -100 &&
        c <= 100 &&
        s >= -100 &&
        s <= 100 &&
        blur >= 0 &&
        blur <= 20 &&
        sharpen >= 0 &&
        sharpen <= 100
      );
    }
    case "autoEnhance": {
      const base = ["brightness", "contrast", "saturation", "sharpen"].every(
        (k) => typeof o[k] === "number" && Number.isFinite(o[k] as number)
      );
      if (!base) return false;
      if (o.targetMaxEdge !== undefined && (typeof o.targetMaxEdge !== "number" || !Number.isFinite(o.targetMaxEdge))) {
        return false;
      }
      return true;
    }
    default:
      return false;
  }
}

export function isExportOptions(value: unknown): value is ExportOptions {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.webpQuality === "number" &&
    Number.isFinite(o.webpQuality) &&
    typeof o.maxLongEdge === "number" &&
    Number.isFinite(o.maxLongEdge)
  );
}
