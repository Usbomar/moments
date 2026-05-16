"use client";

import { useCallback, useId } from "react";
import { colorHexToPaletteOption } from "@/components/admin/adminAssetHelpers";
import { normalizeHex } from "@/lib/color-utils";

export type ColorOption = { label: string; hex: string };

type Props = {
  value: string | null | undefined;
  options: ColorOption[];
  onChange: (hex: string | null) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function ColorSelect({ value, options, onChange, disabled, id, className }: Props) {
  const pickerId = useId();
  const hex = normalizeHex(value ?? undefined);
  const selectValue = colorHexToPaletteOption(hex, options);
  const inPalette = hex !== null && options.some((o) => normalizeHex(o.hex) === hex);
  const pickerValue = hex ?? "#808080";

  const onPickerChange = useCallback(
    (next: string) => {
      const n = normalizeHex(next);
      onChange(n);
    },
    [onChange]
  );

  return (
    <span className={`admin-assets-inline-color admin-color-select${className ? ` ${className}` : ""}`}>
      <span
        className="admin-assets-color-chip"
        style={{
          backgroundColor: hex ?? "transparent",
          opacity: hex !== null ? 1 : 0.25,
          border: hex && (hex === "#fafafa" || hex === "#ffffff") ? "1px solid var(--border-dark)" : undefined
        }}
        aria-hidden
      />
      <select
        id={id}
        disabled={disabled}
        value={selectValue}
        onChange={(e) => onChange(e.target.value ? normalizeHex(e.target.value) : null)}
      >
        <option value="">Sense color</option>
        {options.map((opt) => {
          const h = normalizeHex(opt.hex)!;
          return (
            <option key={h} value={h}>
              {opt.label}
            </option>
          );
        })}
        {hex && !inPalette ? (
          <option value={hex}>Personalitzat ({hex})</option>
        ) : null}
      </select>
      <label htmlFor={pickerId} className="sr-only">
        Selector de color lliure
      </label>
      <input
        id={pickerId}
        type="color"
        className="admin-color-select-picker"
        disabled={disabled}
        value={pickerValue}
        title="Triar qualsevol color"
        aria-label="Triar qualsevol color"
        onChange={(e) => onPickerChange(e.target.value)}
      />
    </span>
  );
}

/** @deprecated Usa ColorSelect */
export const ColorHueSelect = ColorSelect;
