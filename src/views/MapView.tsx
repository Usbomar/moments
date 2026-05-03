"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Layer, Map as LeafletMap } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Asset } from "@/lib/types";
import { LibraryGrid } from "@/components/library-grid";

interface Props {
  items: Asset[];
  onOpenViewer: (asset: Asset) => void;
  onEditPhoto: (asset: Asset) => void;
}

interface Cluster {
  key: string;
  lat: number;
  lng: number;
  city: string;
  items: Asset[];
}

function clusterByArea(items: Asset[]): Cluster[] {
  const grouped = new Map<string, Cluster>();
  for (const item of items) {
    const lat = item.location?.lat;
    const lng = item.location?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    const key = `${Math.round(lat * 5) / 5}-${Math.round(lng * 5) / 5}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    grouped.set(key, {
      key,
      lat,
      lng,
      city: item.location?.city || "Unknown",
      items: [item]
    });
  }
  return Array.from(grouped.values());
}

export function MapView({ items, onOpenViewer, onEditPhoto }: Props) {
  const clusters = useMemo(() => clusterByArea(items), [items]);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    const root = mapRootRef.current;
    if (!root || mapRef.current) return;
    mapRef.current = L.map(root).setView([41.3874, 2.1686], 3);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.eachLayer((layer: Layer) => {
      if (layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });
    clusters.forEach((cluster) => {
      const marker = L.circleMarker([cluster.lat, cluster.lng], {
        radius: Math.min(24, Math.max(8, 4 + cluster.items.length)),
        color: "#2f6fed",
        fillColor: "#2f6fed",
        fillOpacity: 0.35
      }).addTo(map);
      marker.bindPopup(`<strong>${cluster.city}</strong><div>${cluster.items.length} foto(s)</div>`);
      marker.on("click", () => setSelectedCluster(cluster));
    });
  }, [clusters]);

  if (!clusters.length) {
    return <p style={{ color: "var(--muted)" }}>No hi ha fotos amb coordenades GPS.</p>;
  }

  return (
    <div>
      <div ref={mapRootRef} style={{ height: 420, borderRadius: 12, overflow: "hidden", marginBottom: 12 }} />

      {selectedCluster ? (
        <section>
          <h3>
            {selectedCluster.city} · {selectedCluster.items.length} foto(s)
          </h3>
          <LibraryGrid
            items={selectedCluster.items}
            onOpenModal={onEditPhoto}
            onOpenViewer={onOpenViewer}
          />
        </section>
      ) : (
        <p style={{ color: "var(--muted)" }}>Selecciona un marcador per veure les fotos d&apos;aquella zona.</p>
      )}
    </div>
  );
}
