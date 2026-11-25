import { Suspense } from "react";
import { AuthShell } from "../auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
