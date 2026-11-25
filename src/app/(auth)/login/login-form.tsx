"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ApiClientError, apiFetch } from "@/lib/api-client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: { email, password } });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "No se pudo iniciar sesión");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="reticle w-full max-w-sm space-y-5 rounded-panel border border-line bg-surface p-7 shadow-hud">
      <div className="space-y-3">
        <span className="grid size-10 place-items-center rounded-[10px] border border-line-strong bg-surface-2">
          <span className="pulse-dot size-2 rounded-full bg-accent" />
        </span>
        <div>
          <p className="t-label">Eddie · HUD</p>
          <h1 className="t-h2">Personal Calendar</h1>
          <p className="mt-1 text-sm text-muted">Inicia sesión para continuar</p>
        </div>
      </div>
      <Field label="Correo">
        {(p) => <Input {...p} type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      {params.get("reset") === "1" && (
        <p role="status" className="rounded-control border border-accent/40 bg-accent/10 p-3 text-sm">
          Contraseña actualizada. Inicia sesión con la nueva.
        </p>
      )}
      <Field label="Contraseña">
        {(p) => <Input {...p} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <div className="-mt-3 text-right">
        <Link href="/forgot-password" className="inline-flex min-h-11 items-center rounded-sm text-sm text-accent underline-offset-4 transition-colors duration-150 hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      {error && (
        <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={loading} className="w-full justify-center">
        {loading ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
