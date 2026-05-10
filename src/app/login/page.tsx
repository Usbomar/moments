"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(() => {
    const n = searchParams.get("next") ?? "/";
    return n.startsWith("/") && !n.startsWith("//") ? n : "/";
  }, [searchParams]);
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(urlError === "auth" ? "No s’ha pogut completar l’autenticació." : null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) {
          setError(err.message);
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
          }
        });
        if (err) {
          setError(err.message);
          return;
        }
      }
      router.push(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Moments</h1>
        <p className="modal-muted login-sub">Inicia sessió per accedir a la biblioteca.</p>

        <div className="login-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-active" : ""} onClick={() => setMode("login")}>
            Entrar
          </button>
          <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "is-active" : ""} onClick={() => setMode("signup")}>
            Registrar-se
          </button>
        </div>

        <form className="login-form" onSubmit={(e) => void onSubmit(e)}>
          <label className="form-group">
            <span>Correu</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="form-group">
            <span>Contrasenya</span>
            <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </label>
          {error ? (
            <p className="modal-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? "Enviant…" : mode === "login" ? "Entrar" : "Crear compte"}
          </button>
        </form>

        <p className="login-guest-link">
          <a href="/guest">Entrar com a convidat</a>
        </p>

        <p className="modal-muted login-hint">
          Configuració: <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> i <code>SUPABASE_SERVICE_ROLE_KEY</code> al fitxer <code>.env.local</code>. Aplica la migració SQL d’auth/RLS a Supabase.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="login-page login-fallback">Carregant…</p>}>
      <LoginForm />
    </Suspense>
  );
}
