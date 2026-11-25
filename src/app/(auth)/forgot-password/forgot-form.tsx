"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { AuthCard, authLinkClass } from "../auth-card";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return setError("Escribe tu correo.");
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/forgot-password", { method: "POST", body: { email: email.trim() } });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "No se pudo enviar la solicitud");
    } finally {
      setLoading(false);
    }
  }

  if (message) {
    return (
      <AuthCard title="Revisa tu correo">
        <div role="status" className="flex gap-3 rounded-control border border-accent/40 bg-accent/10 p-3 text-sm">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <p>{message}</p>
        </div>
        <p className="text-xs text-muted">El enlace caduca en 1 hora. Si no llega, revisa la carpeta de spam.</p>
        <Link href="/login" className={authLinkClass}>
          Volver a iniciar sesión
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Recuperar contraseña" subtitle="Te enviaremos un enlace para elegir una nueva" onSubmit={onSubmit}>
      <Field label="Correo">
        {(p) => (
          <Input {...p} type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
      </Field>
      {error && (
        <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={loading} className="w-full justify-center">
        {loading ? "Enviando…" : "Enviar enlace"}
      </Button>
      <Link href="/login" className={authLinkClass}>
        Volver a iniciar sesión
      </Link>
    </AuthCard>
  );
}
