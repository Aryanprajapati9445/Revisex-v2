import { Button } from "@/components/ui/button";
import type { PaginationMeta } from "@/lib/api-types";

export function Pagination({ meta, onPageChange }: { meta: PaginationMeta; onPageChange: (page: number) => void }) {
  if (meta.totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-3 py-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(meta.page - 1)}
        disabled={meta.page <= 1}
      >
        Previous
      </Button>
      <span className="text-caption text-text-muted">
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(meta.page + 1)}
        disabled={meta.page >= meta.totalPages}
      >
        Next
      </Button>
    </nav>
  );
}
