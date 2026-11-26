import { AuthShell } from "../auth-shell";
import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Nueva contraseña", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <ResetPasswordForm />
    </AuthShell>
  );
}
