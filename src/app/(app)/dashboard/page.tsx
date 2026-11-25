import { getPageUser } from "@/server/auth/actor";
import { LogoutButton } from "./logout-button";

export default async function DashboardPage() {
  const user = await getPageUser();
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted">
        Sesión iniciada como <strong>{user?.name}</strong> ({user?.email}). La UI real llegará en la siguiente fase.
      </p>
      <LogoutButton />
    </main>
  );
}
