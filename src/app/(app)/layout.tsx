import { redirect } from "next/navigation";
import { getPageUser } from "@/server/auth/actor";

// Validación REAL de la sesión en servidor (el proxy solo mira la cookie).
// La UI completa (sidebar/topbar) la sustituye el agente de UI, conservando esta verificación.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getPageUser();
  if (!user) redirect("/login");
  return <div className="min-h-screen">{children}</div>;
}
