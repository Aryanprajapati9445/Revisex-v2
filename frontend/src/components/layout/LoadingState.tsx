export function LoadingState({
  variant = "cards",
  count = 6,
}: {
  variant?: "cards" | "detail";
  count?: number;
}) {
  if (variant === "detail") {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <div data-skeleton-block className="h-7 w-2/3 animate-pulse rounded-control bg-surface" />
        <div data-skeleton-block className="h-4 w-1/3 animate-pulse rounded-control bg-surface" />
        <div data-skeleton-block className="h-32 w-full animate-pulse rounded-panel bg-surface" />
        <div data-skeleton-block className="h-12 w-full animate-pulse rounded-card bg-surface" />
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Loading"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} data-skeleton-block className="h-28 animate-pulse rounded-card bg-surface" />
      ))}
    </div>
  );
}
