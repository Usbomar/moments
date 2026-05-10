"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type DirEntry = { slug: string; displayName: string; href: string };

export default function GuestLandingPage() {
  const router = useRouter();
  const [slugInput, setSlugInput] = useState("");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/guest/directory", { cache: "no-store" });
        const body = (await res.json()) as { entries?: DirEntry[] };
        setEntries(body.entries ?? []);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const goToSlug = useCallback(() => {
    const s = slugInput.trim().toLowerCase();
    if (!s) return;
    router.push(`/g/${encodeURIComponent(s)}`);
  }, [router, slugInput]);

  return (
    <div className="guest-public-page">
      <div className="guest-public-card">
        <h1 className="guest-public-title">Accés convidat</h1>
        <p className="modal-muted guest-public-lead">
          Entra sense compte per veure una col·lecció compartida. Has de tenir l’enllaç o triar un nom del directori (si el propietari hi ha optat).
        </p>

        <div className="guest-public-field">
          <label htmlFor="guest-slug-input">Identificador de la col·lecció</label>
          <div className="guest-public-row">
            <input
              id="guest-slug-input"
              type="text"
              autoComplete="off"
              placeholder="p. ex. abc123def456"
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") goToSlug();
              }}
            />
            <button type="button" className="btn btn-primary" onClick={goToSlug}>
              Obrir
            </button>
          </div>
        </div>

        <section className="guest-public-directory" aria-label="Director opt-in">
          <h2 className="guest-public-subtitle">Col·leccions al directori</h2>
          {loading ? (
            <p className="modal-muted">Carregant…</p>
          ) : entries.length === 0 ? (
            <p className="modal-muted">Cap col·lecció no opta per aparèixer aquí encara.</p>
          ) : (
            <ul className="guest-public-list">
              {entries.map((e) => (
                <li key={e.slug}>
                  <Link href={`/g/${encodeURIComponent(e.slug)}`} className="guest-public-link">
                    {e.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="guest-public-footer">
          <Link href="/login">Iniciar sessió com a membre</Link>
        </p>
      </div>
    </div>
  );
}
