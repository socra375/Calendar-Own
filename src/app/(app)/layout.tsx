import { redirect } from "next/navigation";
import { AppProvider } from "@/components/layout/app-provider";
import { AppShell } from "@/components/layout/app-shell";
import { getPageUser } from "@/server/auth/actor";

// Validación REAL de la sesión en servidor (el proxy solo mira la cookie).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getPageUser();
  if (!user) redirect("/login");
  return (
    <AppProvider user={{ name: user.name, email: user.email }}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
