"use client";

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";
import { LeftNav, type MainNavTab } from "@/components/LeftNav";
import { RetractableTopBarZone } from "@/components/RetractableTopBarZone";
import { TopBar } from "@/components/TopBar";
import type { GalleryView } from "@/components/ViewSelector";

const SIDEBAR_KEY = "moments-sidebar-collapsed";

type Props = {
  children: ReactNode;
  activeNav: MainNavTab;
  onNavChange: (tab: MainNavTab) => void;
  libraryView: GalleryView;
  onLibraryViewChange: (view: GalleryView) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onAdminClick: () => void;
  /** P. ex. pujada de fotos (TopBar, cluster amb les vistes) */
  libraryUploadSlot?: ReactNode;
  /** Opcions de graella (només Quadrícula) */
  libraryGridOptionsSlot?: ReactNode;
  /** Presentació amb música: la barra superior es mostra només en passar el ratolí pel vora superior. */
  topBarRetractable?: boolean;
};

export function MainLayout({
  children,
  activeNav,
  onNavChange,
  libraryView,
  onLibraryViewChange,
  searchInputRef,
  libraryUploadSlot,
  libraryGridOptionsSlot,
  onAdminClick,
  topBarRetractable = false
}: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(SIDEBAR_KEY);
      if (v === "1") {
        const id = window.requestAnimationFrame(() => setSidebarCollapsed(true));
        return () => window.cancelAnimationFrame(id);
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const closeMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(false);
  }, []);

  const openMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(true);
  }, []);

  const topBar = (
    <TopBar
        searchInputRef={searchInputRef}
        libraryView={libraryView}
        onLibraryViewChange={onLibraryViewChange}
        showLibraryViewSelector={activeNav === "library"}
        libraryGridOptionsSlot={activeNav === "library" ? libraryGridOptionsSlot : null}
        libraryUploadSlot={activeNav === "library" ? libraryUploadSlot : null}
        onMenuClick={openMobileDrawer}
        onAdminClick={onAdminClick}
    />
  );

  return (
    <div className={`moments-app${topBarRetractable ? " moments-app--immersive-topbar" : ""}`}>
      {topBarRetractable ? <RetractableTopBarZone>{topBar}</RetractableTopBarZone> : topBar}
      <div className="moments-body">
        <LeftNav
          active={activeNav}
          onChange={onNavChange}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          mobileOpen={mobileDrawerOpen}
          onMobileClose={closeMobileDrawer}
        />
        <main className="moments-main" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
