"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { AuthAlert, AuthCard } from "../auth-card";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = "Escribe tu correo.";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Introduce un correo válido, como nombre@dominio.com.";
    if (!password) next.password = "Escribe tu contraseña.";
    setErrors(next);
    setError(null);
    if (next.email || next.password) return;
    setLoading(true);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: { email, password } });
      const to = params.get("next");
      router.replace(to && to.startsWith("/") && !to.startsWith("//") ? to : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "No se pudo iniciar sesión");
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Iniciar sesión" subtitle="Te damos la bienvenida. Accede a tu agenda." onSubmit={onSubmit}>
      {params.get("reset") === "1" && (
        <p role="status" className="flex items-start gap-2.5 rounded-control border border-success/30 bg-success/10 px-3.5 py-3 text-sm">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          Contraseña actualizada. Inicia sesión con la nueva.
        </p>
      )}
      <Field label="Correo" error={errors.email}>
        {(p) => <Input {...p} type="email" autoFocus autoComplete="username" placeholder="nombre@dominio.com" value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field label="Contraseña" error={errors.password}>
        {(p) => (
          <PasswordInput {...p} autoComplete="current-password" visible={visible} onToggle={() => setVisible((v) => !v)} value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </Field>
      {error && <AuthAlert>{error}</AuthAlert>}
      <div className="space-y-2">
        <Button type="submit" variant="primary" loading={loading} className="h-12 w-full justify-center text-[0.9375rem] md:h-11">
          {loading ? "Entrando…" : "Entrar"}
        </Button>
        <div className="text-center">
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-accent underline-offset-4 transition-colors duration-200 hover:text-accent-hover hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}
