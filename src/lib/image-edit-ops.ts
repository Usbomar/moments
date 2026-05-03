/** Image edit operations: client preview + server Sharp pipeline (same order). */

export type EditOperation =
  | { type: "crop"; x: number; y: number; width: number; height: number }
  | { type: "rotate"; angle: 0 | 90 | 180 | 270 }
  | { type: "brightness"; value: number }
  | { type: "contrast"; value: number }
  | { type: "saturation"; value: number }
  | { type: "blur"; value: number }
  | { type: "sharpen"; value: number }
  | {
      type: "autoEnhance";
      brightness: number;
      contrast: number;
      saturation: number;
      sharpen: number;
    };

export const EDIT_OPERATION_TYPES: EditOperation["type"][] = [
  "crop",
  "rotate",
  "brightness",
  "contrast",
  "saturation",
  "blur",
  "sharpen",
  "autoEnhance"
];

export const MAX_EDIT_OPERATIONS = 100;
export const MAX_EDIT_HISTORY_CLIENT = 10;

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
    case "brightness":
    case "contrast":
    case "saturation":
      return typeof o.value === "number" && Number.isFinite(o.value);
    case "blur":
      return typeof o.value === "number" && o.value >= 0 && o.value <= 20;
    case "sharpen":
      return typeof o.value === "number" && o.value >= 0 && o.value <= 100;
    case "autoEnhance":
      return ["brightness", "contrast", "saturation", "sharpen"].every(
        (k) => typeof o[k] === "number" && Number.isFinite(o[k] as number)
      );
    default:
      return false;
  }
}
