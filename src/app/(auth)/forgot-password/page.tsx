import { ForgotPasswordForm } from "./forgot-form";

export const metadata = { title: "Recuperar contraseña", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center p-4">
      <ForgotPasswordForm />
    </main>
  );
}
