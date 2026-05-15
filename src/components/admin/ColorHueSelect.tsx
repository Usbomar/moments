"use client";

import { colorHueToPreset } from "@/components/admin/adminAssetHelpers";
import { normalizeHue } from "@/lib/admin-color-palette";

export type ColorOption = { label: string; hue: number };

type Props = {
  value: number | null | undefined;
  options: ColorOption[];
  onChange: (hue: number | null) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function ColorHueSelect({ value, options, onChange, disabled, id, className }: Props) {
  const hue =
    typeof value === "number" && Number.isFinite(value) ? normalizeHue(value) : null;
  const selectValue = colorHueToPreset(hue, options);

  return (
    <span className={`admin-assets-inline-color${className ? ` ${className}` : ""}`}>
      <span
        className="admin-assets-color-chip"
        style={{
          backgroundColor: hue !== null ? `hsl(${hue} 72% 46%)` : "transparent",
          opacity: hue !== null ? 1 : 0.25
        }}
        aria-hidden
      />
      <select
        id={id}
        disabled={disabled}
        value={selectValue}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Sense color</option>
        {options.map((opt) => (
          <option key={opt.hue} value={opt.hue}>
            {opt.label}
          </option>
        ))}
      </select>
    </span>
  );
}
