"use client";

import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="rounded-md border border-border px-3 py-2 text-sm"
      onClick={async () => {
        await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        router.replace("/login");
        router.refresh();
      }}
    >
      Cerrar sesión
    </button>
  );
}
