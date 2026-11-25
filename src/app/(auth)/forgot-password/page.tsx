import { AuthShell } from "../auth-shell";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata = { title: "Recuperar contraseña", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
