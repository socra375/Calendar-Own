import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Pagination } from "@/lib/api-client";
import { Button } from "./button";

export function Pager({ pagination, onPage }: { pagination: Pagination | null | undefined; onPage: (p: number) => void }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;
  return (
    <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-3">
      <p className="text-xs text-muted tabular-nums">
        Página {page} de {totalPages} · {total} resultados
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="size-4" aria-hidden /> Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Página siguiente">
          Siguiente <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
