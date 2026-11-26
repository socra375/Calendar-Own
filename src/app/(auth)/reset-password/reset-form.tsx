"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { AuthAlert, AuthCard } from "../auth-card";

type TokenState = { status: "reading" } | { status: "missing" } | { status: "ready"; token: string } | { status: "invalid" };

export function ResetPasswordForm() {
  const router = useRouter();
  const [state, setState] = useState<TokenState>({ status: "reading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<{ password?: string; confirm?: string }>({});
  const [loading, setLoading] = useState(false);
  const read = useRef(false);

  // Lee el token una sola vez y lo quita de la URL (historial) para que no se filtre. El ref evita que el doble
  // efecto de StrictMode (dev) vea ya la URL limpia y lo dé por ausente.
  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) window.history.replaceState(window.history.state, "", window.location.pathname);
    setState(token ? { status: "ready", token } : { status: "missing" });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.status !== "ready") return;
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) return setFe({ password: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.` });
    if (password.length > PASSWORD_MAX_LENGTH) return setFe({ password: `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.` });
    if (password !== confirm) return setFe({ confirm: "Las contraseñas no coinciden." });
    setFe({});
    setLoading(true);
    try {
      await apiFetch("/api/auth/reset-password", { method: "POST", body: { token: state.token, password } });
      router.replace("/login?reset=1");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "INVALID_OR_EXPIRED_TOKEN") {
        setState({ status: "invalid" });
        return;
      }
      setError(err instanceof ApiClientError ? err.message : "No se pudo cambiar la contraseña");
      setLoading(false);
    }
  }

  if (state.status === "reading") {
    return (
      <AuthCard title="Nueva contraseña" eyebrow="Recuperación">
        <p role="status" className="text-sm text-muted">
          Comprobando enlace…
        </p>
      </AuthCard>
    );
  }

  if (state.status === "missing" || state.status === "invalid") {
    return (
      <AuthCard title="Enlace no válido" eyebrow="Recuperación">
        <div role="alert" className="flex gap-3 rounded-control border border-danger/30 bg-danger/10 px-3.5 py-3 text-sm text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            {state.status === "missing"
              ? "Falta el enlace de recuperación. Abre el enlace completo del correo o solicita uno nuevo."
              : "El enlace no es válido o ha caducado. Solicita uno nuevo."}
          </p>
        </div>
        <Link href="/forgot-password" className={buttonClass("primary", "md", "w-full justify-center")}>
          Solicitar un enlace nuevo
        </Link>
        <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-medium text-muted underline-offset-4 transition-colors duration-200 hover:text-fg hover:underline">
          Volver a iniciar sesión
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Nueva contraseña" eyebrow="Recuperación" subtitle={`Elige una contraseña de al menos ${PASSWORD_MIN_LENGTH} caracteres.`} onSubmit={onSubmit}>
      <Field label="Nueva contraseña" hint={`Entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres`} error={fe.password}>
        {(p) => (
          <PasswordInput
            {...p}
            required
            autoFocus
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            visible={visible}
            onToggle={() => setVisible((v) => !v)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <Field label="Confirmar contraseña" error={fe.confirm}>
        {(p) => (
          <Input
            {...p}
            type={visible ? "text" : "password"}
            required
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
      </Field>
      {error && <AuthAlert>{error}</AuthAlert>}
      <Button type="submit" variant="primary" loading={loading} className="w-full justify-center">
        {loading ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </AuthCard>
  );
}
