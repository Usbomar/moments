"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import type { Asset, LocationInfo } from "@/lib/types";

interface Props {
  asset: Asset | null;
  onClose: () => void;
  onSave: (updated: Asset) => void | Promise<void>;
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(value: string): string {
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function formatLocationText(loc?: LocationInfo): string {
  if (!loc) return "";
  return `${loc.city}, ${loc.country}`;
}

export function PhotoModal({ asset, onClose, onSave }: Props) {
  const [title, setTitle] = useState(() => asset?.title ?? "");
  const [description, setDescription] = useState(() => asset?.description ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(() => [...(asset?.tags ?? [])]);
  const [dateValue, setDateValue] = useState(() => (asset ? toDateInputValue(asset.takenAt) : ""));
  const [locationText, setLocationText] = useState(() => formatLocationText(asset?.location));
  const [pickedLocation, setPickedLocation] = useState<LocationInfo | undefined>(() => asset?.location);
  const [favorite, setFavorite] = useState(() => asset?.favorite ?? false);
  const [error, setError] = useState<string | null>(null);

  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const locationTextRef = useRef(locationText);

  useEffect(() => {
    locationTextRef.current = locationText;
  }, [locationText]);

  const handleAddTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagInput("");
  }, [tagInput]);

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((x) => x !== tag));
  }, []);

  const handleSave = useCallback(() => {
    void (async () => {
      if (!asset) return;
      const trimmed = title.trim();
      if (!trimmed) {
        setError("El títol no pot estar buit.");
        return;
      }
      const locFromText = locationText.trim();
      let location: LocationInfo | undefined = pickedLocation;
      if (locFromText) {
        const parts = locFromText.split(",").map((p) => p.trim());
        if (parts.length >= 2 && parts[0] && parts[1]) {
          const city = parts[0];
          const country = parts[1];
          if (location) {
            location = { ...location, city, country };
          } else {
            location = { city, country, lat: 0, lng: 0 };
          }
        }
      }
      const updated: Asset = {
        ...asset,
        title: trimmed,
        description: description.trim(),
        tags: [...tags],
        takenAt: fromDateInputValue(dateValue),
        favorite,
        location
      };
      await onSave(updated);
      onClose();
    })();
  }, [asset, dateValue, description, favorite, locationText, onClose, onSave, pickedLocation, tags, title]);

  useEffect(() => {
    if (!asset) return;
    const root = mapRootRef.current;
    if (!root) return;

    let cancelled = false;
    let createdMap: LeafletMap | null = null;

    void (async () => {
      const leafletMod = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      const L = leafletMod.default;

      if (cancelled) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }

      const center: [number, number] =
        asset.location && asset.location.lat && asset.location.lng
          ? [asset.location.lat, asset.location.lng]
          : [41.3874, 2.1686];

      createdMap = L.map(root).setView(center, asset.location?.lat ? 10 : 3);
      if (cancelled) {
        createdMap.remove();
        createdMap = null;
        return;
      }
      mapRef.current = createdMap;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(createdMap);

      const placeMarker = (latlng: { lat: number; lng: number }) => {
        if (!mapRef.current) return;
        if (markerRef.current) {
          markerRef.current.setLatLng(latlng);
        } else {
          markerRef.current = L.marker(latlng).addTo(mapRef.current);
        }
        setPickedLocation((prev) => {
          const text = locationTextRef.current.trim();
          if (text) {
            const parts = text.split(",").map((p) => p.trim());
            if (parts.length >= 2 && parts[0] && parts[1]) {
              return { lat: latlng.lat, lng: latlng.lng, city: parts[0], country: parts[1] };
            }
          }
          return {
            lat: latlng.lat,
            lng: latlng.lng,
            city: prev?.city && prev.city !== "Unknown" ? prev.city : "Unknown",
            country: prev?.country && prev.country !== "Unknown" ? prev.country : "Unknown"
          };
        });
      };

      if (asset.location?.lat && asset.location?.lng) {
        placeMarker({ lat: asset.location.lat, lng: asset.location.lng });
      }

      createdMap.on("click", (e) => {
        placeMarker({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [asset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!asset) return null;

  const imageUrl = (asset.files.previewUrl || asset.files.originalUrl).trim();

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Editor de foto" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Editar foto</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Tancar">
            ×
          </button>
        </header>

        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URLs / external storage
          <img src={imageUrl} alt={asset.title} referrerPolicy="no-referrer" className="modal-photo" />
        ) : (
          <p className="modal-muted">Sense imatge de previsualització.</p>
        )}

        {error ? <p className="modal-error">{error}</p> : null}

        <div className="form-group">
          <label htmlFor="photo-title">Títol</label>
          <input id="photo-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="form-group">
          <label htmlFor="photo-desc">Descripció</label>
          <textarea id="photo-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Tags</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="nou tag" />
            <button type="button" onClick={handleAddTag}>
              Afegir
            </button>
          </div>
          <div className="tag-pills" style={{ marginTop: 8 }}>
            {tags.map((t) => (
              <button key={t} type="button" className="tag-pill" onClick={() => handleRemoveTag(t)}>
                #{t} ×
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="photo-date">Data (presa)</label>
          <input id="photo-date" type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)} />
        </div>

        <div className="form-group">
          <label htmlFor="photo-loc">Ubicació (text)</label>
          <input
            id="photo-loc"
            type="text"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="Ciutat, País"
          />
          <small className="modal-muted">Opcional: clica el mapa per establir coordenades GPS.</small>
          <div ref={mapRootRef} className="modal-map" />
        </div>

        <div className="form-group form-row">
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
            Preferit
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel·lar
          </button>
          <button type="button" className="primary" onClick={handleSave}>
            Desar
          </button>
        </div>
      </div>
    </div>
  );
}
