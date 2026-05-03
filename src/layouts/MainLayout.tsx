"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { LeftNav, type MainNavTab } from "@/components/LeftNav";
import { TopBar } from "@/components/TopBar";
import type { GalleryView } from "@/components/ViewSelector";

const SIDEBAR_KEY = "moments-sidebar-collapsed";

type Props = {
  children: React.ReactNode;
  activeNav: MainNavTab;
  onNavChange: (tab: MainNavTab) => void;
  libraryView: GalleryView;
  onLibraryViewChange: (view: GalleryView) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
};

export function MainLayout({
  children,
  activeNav,
  onNavChange,
  libraryView,
  onLibraryViewChange,
  searchInputRef
}: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(SIDEBAR_KEY);
      if (v === "1") setSidebarCollapsed(true);
    } catch {
      /* ignore */
    }
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

  return (
    <div className="moments-app">
      <TopBar
        searchInputRef={searchInputRef}
        libraryView={libraryView}
        onLibraryViewChange={onLibraryViewChange}
        showLibraryViewSelector={activeNav === "library"}
        onMenuClick={openMobileDrawer}
      />
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
