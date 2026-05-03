"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { loadCollections, saveCollections } from "@/lib/collections-storage";
import type { Asset, LocationInfo } from "@/lib/types";

interface Props {
  asset: Asset | null;
  onClose: () => void;
  onSave: (updated: Asset) => void | Promise<void>;
  /** Tags ja usats en altres fotos (minúscules, únics); per suggerir mentre s’escriu. */
  libraryTagSuggestions?: string[];
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

type GeocodeResponse = {
  lat: number;
  lng: number;
  city: string;
  country: string;
  boundingbox?: [string, string, string, string] | null;
};

async function fetchGeocode(q: string, signal?: AbortSignal): Promise<GeocodeResponse | null> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal, cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as GeocodeResponse;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function PhotoModal({ asset, onClose, onSave, libraryTagSuggestions = [] }: Props) {
  const [title, setTitle] = useState(() => asset?.title ?? "");
  const [description, setDescription] = useState(() => asset?.description ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(() => [...(asset?.tags ?? [])]);
  const [dateValue, setDateValue] = useState(() => (asset ? toDateInputValue(asset.takenAt) : ""));
  const [locationText, setLocationText] = useState(() => formatLocationText(asset?.location));
  const [pickedLocation, setPickedLocation] = useState<LocationInfo | undefined>(() => asset?.location);
  const [favorite, setFavorite] = useState(() => asset?.favorite ?? false);
  const [colorHue, setColorHue] = useState<number | null>(() =>
    typeof asset?.colorHue === "number" && Number.isFinite(asset.colorHue) ? Math.min(359, Math.max(0, Math.round(asset.colorHue))) : null
  );
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [geocodeHint, setGeocodeHint] = useState<string | null>(null);
  const [collections, setCollections] = useState(() => loadCollections());

  useEffect(() => {
    const onCol = () => setCollections(loadCollections());
    window.addEventListener("moments:collections-changed", onCol);
    return () => window.removeEventListener("moments:collections-changed", onCol);
  }, []);

  const syncedAssetIdRef = useRef<string | null>(null);

  /**
   * Sincronitza el formulari només quan canvia l’ID de l’asset (altra foto).
   * Evita esborrar edicions locals quan el pare refresca el mateix asset (p. ex. després d’editar imatge).
   */
  useEffect(() => {
    if (!asset) return;
    if (syncedAssetIdRef.current === asset.id) return;
    syncedAssetIdRef.current = asset.id;
    setTitle(asset.title ?? "");
    setDescription(asset.description ?? "");
    setTagInput("");
    setTags([...(asset.tags ?? [])]);
    setDateValue(toDateInputValue(asset.takenAt));
    setLocationText(formatLocationText(asset.location));
    setPickedLocation(asset.location);
    setFavorite(asset.favorite ?? false);
    setColorHue(
      typeof asset.colorHue === "number" && Number.isFinite(asset.colorHue)
        ? Math.min(359, Math.max(0, Math.round(asset.colorHue)))
        : null
    );
    setError(null);
    setGeocodeHint(null);
  }, [asset]);

  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const locationTextRef = useRef(locationText);
  const debouncedLocationText = useDebouncedValue(locationText, 650);

  useEffect(() => {
    locationTextRef.current = locationText;
  }, [locationText]);

  const tagComboboxRef = useRef<HTMLDivElement | null>(null);
  const tagListId = useId();
  const [tagSuggestionsOpen, setTagSuggestionsOpen] = useState(false);
  const [tagHighlight, setTagHighlight] = useState(0);

  const tagCandidates = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    const selected = new Set(tags);
    return libraryTagSuggestions.filter((t) => !selected.has(t) && (q === "" || t.includes(q)));
  }, [libraryTagSuggestions, tagInput, tags]);

  useEffect(() => {
    setTagHighlight(0);
  }, [tagCandidates.length, tagInput]);

  const pickTag = useCallback((t: string) => {
    const n = t.trim().toLowerCase();
    if (!n) return;
    setTags((prev) => (prev.includes(n) ? prev : [...prev, n]));
    setTagInput("");
    setTagSuggestionsOpen(false);
  }, []);

  const handleAddTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase();
    if (!t) return;
    pickTag(t);
  }, [pickTag, tagInput]);

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((x) => x !== tag));
  }, []);

  useEffect(() => {
    if (!tagSuggestionsOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = tagComboboxRef.current;
      if (el && !el.contains(e.target as Node)) {
        setTagSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [tagSuggestionsOpen]);

  const handleSave = useCallback(() => {
    void (async () => {
      if (!asset) return;
      setError(null);
      const trimmed = title.trim();
      if (!trimmed) {
        setError("El títol no pot estar buit.");
        return;
      }
      const locFromText = locationText.trim();
      let location: LocationInfo | undefined;

      if (!locFromText) {
        location = undefined;
      } else {
        const geo = await fetchGeocode(locFromText);
        if (geo) {
          location = { lat: geo.lat, lng: geo.lng, city: geo.city, country: geo.country };
          const parts = locFromText.split(",").map((p) => p.trim());
          if (parts.length >= 2 && parts[0] && parts[1]) {
            location = { ...location, city: parts[0], country: parts[1] };
          }
        } else if (
          pickedLocation?.lat &&
          pickedLocation?.lng &&
          !(pickedLocation.lat === 0 && pickedLocation.lng === 0)
        ) {
          const parts = locFromText.split(",").map((p) => p.trim());
          if (parts.length >= 2 && parts[0] && parts[1]) {
            location = { ...pickedLocation, city: parts[0], country: parts[1] };
          } else {
            location = pickedLocation;
          }
        } else {
          setError(
            "No s'ha pogut determinar la ubicació. Escriu un lloc més concret o clica al mapa."
          );
          return;
        }
      }

      const updated: Asset = {
        ...asset,
        title: trimmed,
        description: description.trim(),
        tags: [...tags],
        takenAt: fromDateInputValue(dateValue),
        favorite,
        location,
        files: asset.files
      };
      updated.colorHue =
        colorHue !== null && typeof colorHue === "number" ? Math.min(359, Math.max(0, Math.round(colorHue))) : null;
      await onSave(updated);
      onClose();
    })();
  }, [asset, colorHue, dateValue, description, favorite, locationText, onClose, onSave, pickedLocation, tags, title]);

  const toggleCollectionMembership = useCallback(
    (collectionId: string, checked: boolean) => {
      if (!asset) return;
      const all = loadCollections();
      const idx = all.findIndex((c) => c.id === collectionId);
      if (idx === -1) return;
      const c = { ...all[idx] };
      if (checked) {
        if (!c.assetIds.includes(asset.id)) {
          c.assetIds = [...c.assetIds, asset.id];
          if (!c.coverAssetId) c.coverAssetId = asset.id;
        }
      } else {
        c.assetIds = c.assetIds.filter((id) => id !== asset.id);
        if (c.coverAssetId === asset.id) {
          c.coverAssetId = c.assetIds[0] ?? null;
        }
      }
      const next = [...all];
      next[idx] = c;
      saveCollections(next);
      setCollections(loadCollections());
    },
    [asset]
  );

  useEffect(() => {
    if (!asset) return;
    const root = mapRootRef.current;
    if (!root) return;

    setMapReady(false);

    let cancelled = false;
    let createdMap: LeafletMap | null = null;

    void (async () => {
      const leafletMod = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      const L = leafletMod.default as typeof import("leaflet");
      leafletRef.current = L;

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
        leafletRef.current = null;
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

      requestAnimationFrame(() => {
        if (cancelled || !createdMap) return;
        createdMap.invalidateSize();
        setMapReady(true);
      });
    })();

    return () => {
      cancelled = true;
      leafletRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [asset]);

  useEffect(() => {
    if (!asset || !mapReady) return;
    const q = debouncedLocationText.trim();
    if (!q) {
      setGeocodeHint(null);
      return;
    }

    const ctrl = new AbortController();
    void (async () => {
      try {
        const data = await fetchGeocode(q, ctrl.signal);
        if (ctrl.signal.aborted) return;
        const L = leafletRef.current;
        const map = mapRef.current;
        if (!L || !map) return;

        if (!data) {
          setGeocodeHint("No s'ha trobat el lloc. Prova amb una altra cerca o clica al mapa.");
          return;
        }

        setGeocodeHint(null);
        const { lat, lng, city, country, boundingbox } = data;

        if (boundingbox && boundingbox.length === 4) {
          const [south, north, west, east] = boundingbox.map(Number);
          if ([south, north, west, east].every(Number.isFinite)) {
            map.fitBounds(L.latLngBounds(L.latLng(south, west), L.latLng(north, east)), {
              padding: [24, 24],
              maxZoom: 17
            });
          } else {
            map.setView([lat, lng], 14);
          }
        } else {
          map.setView([lat, lng], 14);
        }

        requestAnimationFrame(() => map.invalidateSize());

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng]).addTo(map);
        }
        setPickedLocation({ lat, lng, city, country });
      } catch {
        if (!ctrl.signal.aborted) {
          setGeocodeHint("Error en la cerca de la ubicació.");
        }
      }
    })();

    return () => ctrl.abort();
  }, [asset, debouncedLocationText, mapReady]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!asset) return null;

  const tagListHighlight = tagCandidates.length ? Math.min(tagHighlight, tagCandidates.length - 1) : -1;

  const imageUrl = (asset.files.previewUrl || asset.files.originalUrl).trim();

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="photo-modal-title" onClick={onClose}>
      <div className="modal-content photo-modal" onClick={(e) => e.stopPropagation()}>
        <header className="photo-modal__header">
          <div>
            <p className="photo-modal__section-title" style={{ marginBottom: 4 }}>
              Metadades
            </p>
            <h2 id="photo-modal-title" className="photo-modal__title">
              Editar foto
            </h2>
          </div>
          <button type="button" className="modal-close btn btn-ghost btn-sm" onClick={onClose} aria-label="Tancar el diàleg">
            ×
          </button>
        </header>

        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URLs / external storage
          <img src={imageUrl} alt={`Vista prèvia: ${asset.title}`} referrerPolicy="no-referrer" className="modal-photo" />
        ) : (
          <p className="modal-muted">Sense imatge de previsualització.</p>
        )}

        {collections.length ? (
          <div className="form-group">
            <p className="photo-modal__section-title">Col·leccions (local)</p>
            <div className="collection-check-list" role="group" aria-label="Col·leccions on incloure la foto">
              {collections.map((c) => (
                <label key={c.id} className="collection-check-row">
                  <input
                    type="checkbox"
                    checked={c.assetIds.includes(asset.id)}
                    onChange={(e) => toggleCollectionMembership(c.id, e.target.checked)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="modal-error">{error}</p> : null}

        <div className="form-group">
          <label htmlFor="photo-title">Títol</label>
          <input id="photo-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
        </div>

        <div className="form-group">
          <label htmlFor="photo-desc">Descripció</label>
          <textarea id="photo-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="form-group">
          <p className="photo-modal__section-title">Vista per colors</p>
          <label htmlFor="photo-color-enabled" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              id="photo-color-enabled"
              type="checkbox"
              checked={colorHue !== null}
              onChange={(e) => {
                if (e.target.checked) {
                  setColorHue(
                    typeof asset.colorHue === "number" && Number.isFinite(asset.colorHue)
                      ? Math.min(359, Math.max(0, Math.round(asset.colorHue)))
                      : 42
                  );
                } else {
                  setColorHue(null);
                }
              }}
            />
            Assignar manualment un to (cap valor automàtic de l’aplicació)
          </label>
          {colorHue !== null ? (
            <div className="photo-modal-color-row">
              <label htmlFor="photo-color-hue" className="modal-muted" style={{ fontSize: 13 }}>
                To 0–359°
              </label>
              <div className="photo-modal__row" style={{ alignItems: "center", marginTop: 8 }}>
                <input
                  id="photo-color-hue"
                  type="range"
                  min={0}
                  max={359}
                  value={colorHue}
                  onChange={(e) => setColorHue(Number.parseInt(e.target.value, 10))}
                  style={{ flex: 1 }}
                />
                <span className="photo-modal-color-value" aria-live="polite">
                  {colorHue}°
                </span>
                <span
                  className="photo-modal-color-swatch"
                  style={{ background: `hsl(${colorHue} 72% 46%)` }}
                  aria-hidden
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="form-group">
          <label htmlFor="photo-tags">Tags</label>
          <div className="photo-modal__row">
            <div ref={tagComboboxRef} className="photo-tag-combobox">
              <input
                id="photo-tags"
                className="photo-modal__tag-input"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onFocus={() => setTagSuggestionsOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && tagSuggestionsOpen) {
                    e.preventDefault();
                    e.stopPropagation();
                    setTagSuggestionsOpen(false);
                    return;
                  }
                  const n = tagCandidates.length;
                  if (e.key === "ArrowDown" && n > 0) {
                    e.preventDefault();
                    setTagHighlight((h) => Math.min(Math.min(h, n - 1) + 1, n - 1));
                    return;
                  }
                  if (e.key === "ArrowUp" && n > 0) {
                    e.preventDefault();
                    setTagHighlight((h) => Math.max(Math.min(h, n - 1) - 1, 0));
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Cerca o crea un tag"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={tagSuggestionsOpen}
                aria-controls={tagListId}
                aria-describedby="photo-tags-hint"
              />
              {tagSuggestionsOpen && libraryTagSuggestions.length > 0 ? (
                <div id={tagListId} className="photo-tag-suggestions" role="listbox" aria-label="Tags existents a la biblioteca">
                  {tagCandidates.length > 0 ? (
                    tagCandidates.map((t, i) => (
                      <button
                        key={t}
                        type="button"
                        role="option"
                        aria-selected={i === tagListHighlight}
                        className={i === tagListHighlight ? "is-active" : undefined}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          pickTag(t);
                        }}
                      >
                        #{t}
                      </button>
                    ))
                  ) : (
                    <div className="photo-tag-suggestions-hint">
                      {tagInput.trim()
                        ? `Cap coincidència a la biblioteca. Retorn o «Afegir» afegeix el tag «${tagInput.trim().toLowerCase()}».`
                        : "Tots els tags de la biblioteca ja són a aquesta foto, o no n’hi ha cap encara. Escriu un nom nou i prem Retorn o «Afegir»."}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <button type="button" className="btn btn-sm" onClick={handleAddTag}>
              Afegir
            </button>
          </div>
          <p id="photo-tags-hint" className="modal-muted" style={{ marginTop: 6 }}>
            Llista: tags de la biblioteca (filtre mentre escrius). Clic a una línia per afegir-la. Retorn o «Afegir» afegeixen sempre el text del camp (nou o existent).
          </p>
          <div className="tag-pills" style={{ marginTop: 8 }}>
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                className="tag-pill"
                onClick={() => handleRemoveTag(t)}
                aria-label={`Eliminar el tag ${t}`}
              >
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
            placeholder="Ciutat, país, adreça o negoci…"
            autoComplete="street-address"
          />
          {geocodeHint ? <p className="modal-error" style={{ marginTop: 6 }}>{geocodeHint}</p> : null}
          <small className="modal-muted">
            El mapa segueix el text (cerca amb OpenStreetMap). També pots clicar al mapa per ajustar el punt.
          </small>
          <div ref={mapRootRef} className="modal-map" role="application" aria-label="Mapa per triar la ubicació" />
        </div>

        <div className="form-group form-row">
          <label htmlFor="photo-fav" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input id="photo-fav" type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
            Preferit
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel·lar
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Desar
          </button>
        </div>
      </div>
    </div>
  );
}
