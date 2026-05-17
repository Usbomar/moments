"use client";

export type SliderKeyboardHelpProps = {
  open: boolean;
  onToggle: () => void;
};

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "← / →", action: "Foto anterior o següent" },
  { keys: "Espai", action: "Reprodueix / pausa" },
  { keys: "Inici / Fi", action: "Primera o última foto" },
  { keys: "Esc", action: "Sortir de pantalla completa" },
  { keys: "?", action: "Mostrar o amagar aquesta ajuda" }
];

export function SliderKeyboardHelp({ open, onToggle }: SliderKeyboardHelpProps) {
  return (
    <>
      <button
        type="button"
        className="slider-keyboard-help__toggle"
        aria-label={open ? "Amagar dreceres de teclat" : "Mostrar dreceres de teclat"}
        aria-expanded={open}
        title="Dreceres (?)"
        onClick={onToggle}
      >
        ?
      </button>
      {open ? (
        <div className="slider-keyboard-help__panel" role="dialog" aria-label="Dreceres de teclat">
          <strong>Dreceres</strong>
          <ul>
            {SHORTCUTS.map((row) => (
              <li key={row.keys}>
                <kbd>{row.keys}</kbd>
                <span>{row.action}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
