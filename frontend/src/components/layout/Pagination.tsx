import type { PaginationMeta } from "@/lib/api-types";

export function Pagination({ meta, onPageChange }: { meta: PaginationMeta; onPageChange: (page: number) => void }) {
  if (meta.totalPages <= 1) return null;

  const buttonClass =
    "rounded-control bg-surface px-2.5 py-1.5 text-ui transition-colors duration-150 hover:bg-accent-subtle disabled:opacity-40 disabled:hover:bg-surface";

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-3 py-6">
      <button
        type="button"
        className={buttonClass}
        onClick={() => onPageChange(meta.page - 1)}
        disabled={meta.page <= 1}
      >
        Previous
      </button>
      <span className="text-caption text-text-muted">
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </span>
      <button
        type="button"
        className={buttonClass}
        onClick={() => onPageChange(meta.page + 1)}
        disabled={meta.page >= meta.totalPages}
      >
        Next
      </button>
    </nav>
  );
}
