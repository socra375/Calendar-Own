import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Iniciar sesión · Personal Calendar" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
