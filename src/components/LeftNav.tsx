"use client";

import { useCallback, useEffect, useState } from "react";

export type MainNavTab = "library" | "map" | "collections" | "memories" | "analytics";

const ITEMS: Array<{ id: MainNavTab; label: string; icon: string }> = [
  { id: "library", label: "Biblioteca", icon: "📸" },
  { id: "map", label: "Mapa", icon: "🗺" },
  { id: "collections", label: "Col·leccions", icon: "📁" },
  { id: "memories", label: "Records", icon: "💭" },
  { id: "analytics", label: "Analítiques", icon: "📊" }
];

type Props = {
  active: MainNavTab;
  onChange: (tab: MainNavTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export function LeftNav({ active, onChange, collapsed, onToggleCollapse, mobileOpen, onMobileClose }: Props) {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const select = useCallback(
    (id: MainNavTab) => {
      onChange(id);
      onMobileClose();
    },
    [onChange, onMobileClose]
  );

  const desktopHidden = collapsed && !isNarrow;
  const navClass = [
    "moments-sidenav",
    isNarrow ? "moments-sidenav--drawer" : "",
    mobileOpen && isNarrow ? "moments-sidenav--open" : "",
    desktopHidden ? "moments-sidenav--collapsed" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      {isNarrow && mobileOpen ? <button type="button" className="moments-drawer-backdrop" aria-label="Tancar menú" onClick={onMobileClose} /> : null}
      <aside className={navClass} aria-label="Navegació principal">
        <div className="moments-sidenav-head">
          {!isNarrow ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleCollapse} aria-expanded={!collapsed} aria-label="Plegar barra lateral">
              {collapsed ? "»" : "«"}
            </button>
          ) : null}
        </div>
        <nav className="moments-sidenav-nav">
          {ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`moments-nav-item ${item.id === "map" ? "moments-nav-item--map" : ""} ${active === item.id ? "moments-nav-item--active" : ""}`}
              onClick={() => select(item.id)}
              aria-current={active === item.id ? "page" : undefined}
            >
              <span aria-hidden>{item.icon}</span>
              {!desktopHidden ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
