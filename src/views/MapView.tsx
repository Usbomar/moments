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

function thumbUrl(asset: Asset): string {
  return (asset.files.thumbUrl || asset.files.previewUrl || asset.files.originalUrl).trim();
}

function buildClusterPopupContent(cluster: Cluster, onOpen: (a: Asset) => void): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "map-cluster-popup-inner";

  const title = document.createElement("strong");
  title.textContent = cluster.city;
  wrap.appendChild(title);

  const count = document.createElement("div");
  count.className = "map-cluster-popup-count";
  count.textContent = `${cluster.items.length} foto(s) — clic a una miniatura per obrir-la`;
  wrap.appendChild(count);

  const sorted = [...cluster.items].sort((a, b) => Number(b.favorite) - Number(a.favorite)).slice(0, 5);
  const thumbs = document.createElement("div");
  thumbs.className = "map-cluster-popup-thumbs";
  thumbs.setAttribute("role", "group");
  thumbs.setAttribute("aria-label", "Fins a 5 miniatures (preferides primer)");

  for (const asset of sorted) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-cluster-popup-thumb";
    btn.title = asset.title;
    btn.setAttribute("aria-label", `Obrir ${asset.title}`);
    const img = document.createElement("img");
    img.src = thumbUrl(asset);
    img.alt = asset.title;
    img.loading = "lazy";
    btn.appendChild(img);
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onOpen(asset);
    });
    thumbs.appendChild(btn);
  }
  wrap.appendChild(thumbs);
  return wrap;
}

export function MapView({ items, onOpenViewer, onEditPhoto }: Props) {
  const clusters = useMemo(() => clusterByArea(items), [items]);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [layerMode, setLayerMode] = useState<"markers" | "heatmap">("markers");
  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const onOpenViewerRef = useRef(onOpenViewer);
  useEffect(() => {
    onOpenViewerRef.current = onOpenViewer;
  }, [onOpenViewer]);

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
      if (layer instanceof L.CircleMarker || layer instanceof L.Circle) {
        map.removeLayer(layer);
      }
    });
    if (layerMode === "markers") {
      clusters.forEach((cluster) => {
        const marker = L.circleMarker([cluster.lat, cluster.lng], {
          radius: Math.min(24, Math.max(8, 4 + cluster.items.length)),
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.35
        }).addTo(map);

        const popupContent = buildClusterPopupContent(cluster, (a) => {
          onOpenViewerRef.current(a);
          map.closePopup();
        });
        marker.bindPopup(popupContent, {
          maxWidth: 320,
          className: "map-cluster-popup-wrap",
          closeButton: true
        });
        marker.on("popupopen", () => {
          setSelectedCluster(cluster);
        });
      });
    } else {
      clusters.forEach((cluster) => {
        L.circle([cluster.lat, cluster.lng], {
          radius: Math.min(70000, 14000 + cluster.items.length * 2500),
          color: "#ef4444",
          weight: 1,
          fillColor: "#ef4444",
          fillOpacity: Math.min(0.45, 0.08 + cluster.items.length * 0.02)
        }).addTo(map);
      });
    }
    if (clusters.length) {
      const bounds = L.latLngBounds(clusters.map((c) => [c.lat, c.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
    }
  }, [clusters, layerMode]);

  if (!clusters.length) {
    return <p className="view-empty">No hi ha fotos amb coordenades GPS.</p>;
  }
  const activeCluster = layerMode === "markers" ? selectedCluster : null;

  return (
    <div>
      <div className="map-view-toggle-row">
        <button type="button" className={`btn btn-sm ${layerMode === "markers" ? "btn-primary" : ""}`} onClick={() => setLayerMode("markers")}>
          Marcadors
        </button>
        <button type="button" className={`btn btn-sm ${layerMode === "heatmap" ? "btn-primary" : ""}`} onClick={() => setLayerMode("heatmap")}>
          Mapa de calor
        </button>
      </div>
      <div ref={mapRootRef} className="map-view-shell" />

      {activeCluster ? (
        <section>
          <h3 className="view-section-title">
            {activeCluster.city} · {activeCluster.items.length} foto(s)
          </h3>
          <LibraryGrid
            items={activeCluster.items}
            onOpenModal={onEditPhoto}
            onOpenViewer={onOpenViewer}
          />
        </section>
      ) : (
        <p className="view-empty">
          {layerMode === "markers"
            ? "Clica un marcador al mapa per veure les fotos d&apos;aquella zona (i miniatures al popup)."
            : "Vista de calor activa: canvia a Marcadors per veure miniatures i obrir fotos."}
        </p>
      )}
    </div>
  );
}
