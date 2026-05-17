"use client";

import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import type { Asset } from "@/lib/types";
import { hasCoords } from "@/lib/slider-temporal-nav";

export type SliderMiniMapProps = {
  items: Asset[];
  highlightIndices: number[];
  currentIndex: number;
};

export function SliderMiniMap({ items, highlightIndices, currentIndex }: SliderMiniMapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  const current = items[currentIndex];
  const showMap = Boolean(current && hasCoords(current));

  useEffect(() => {
    if (!showMap || !rootRef.current) return;

    let cancelled = false;

    void (async () => {
      const leafletMod = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      const L = leafletMod;
      leafletRef.current = L;

      if (cancelled || !rootRef.current) return;

      if (!mapRef.current) {
        const map = L.map(rootRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false
        });
        mapRef.current = map;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18
        }).addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showMap]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    const L = leafletRef.current;
    if (!showMap || !map || !layer || !L) return;

    layer.clearLayers();
    const bounds: [number, number][] = [];
    const indexSet = new Set(highlightIndices.length ? highlightIndices : [currentIndex]);

    for (const idx of indexSet) {
      const asset = items[idx];
      if (!asset || !hasCoords(asset)) continue;
      const { lat, lng } = asset.location;
      const isCurrent = idx === currentIndex;
      L.circleMarker([lat, lng], {
        radius: isCurrent ? 7 : 4,
        color: isCurrent ? "#6b9fff" : "#e8ecf2",
        weight: isCurrent ? 2 : 1,
        fillColor: isCurrent ? "#6b9fff" : "#9aa8bc",
        fillOpacity: isCurrent ? 0.95 : 0.65
      }).addTo(layer);
      bounds.push([lat, lng]);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0]!, 13);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [18, 18], maxZoom: 14 });
    } else {
      const c = items[currentIndex];
      if (c && hasCoords(c)) {
        map.setView([c.location.lat, c.location.lng], 13);
      }
    }

    map.invalidateSize();
  }, [currentIndex, highlightIndices, items, showMap]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
        leafletRef.current = null;
      }
    };
  }, []);

  if (!showMap || !current) return null;

  const city = current.location?.city?.trim();
  const label = city || "Ubicació";

  return (
    <div className="slider-mini-map" aria-label={`Mapa: ${label}`}>
      <span className="slider-mini-map__label">{label}</span>
      <div ref={rootRef} className="slider-mini-map__canvas" />
    </div>
  );
}

