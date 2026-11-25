import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Nueva contraseña", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center p-4">
      <ResetPasswordForm />
    </main>
  );
}
