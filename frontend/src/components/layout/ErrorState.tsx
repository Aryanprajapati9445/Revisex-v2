import { ApiError } from "@/lib/api-client";

/**
 * The single place error copy is decided, so the 404-masking rule is enforced
 * once rather than in every screen.
 */
export function ErrorState({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.status === 501) {
    return (
      <div role="status" className="rounded-panel bg-surface px-6 py-10 text-center">
        <p className="text-base font-medium">Not available yet</p>
        <p className="mt-1 text-ui text-text-muted">This part of the platform hasn’t been built yet.</p>
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    // Deliberately says nothing about permissions: the backend returns 404 for
    // both "missing" and "out of your scope" so the two cannot be told apart.
    return (
      <div role="alert" className="rounded-panel bg-surface px-6 py-10 text-center">
        <p className="text-base font-medium">Not found</p>
        <p className="mt-1 text-ui text-text-muted">We couldn’t find what you were looking for.</p>
      </div>
    );
  }

  const message =
    error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

  return (
    <div role="alert" className="rounded-panel bg-surface px-6 py-10 text-center">
      <p className="text-base font-medium">Something went wrong</p>
      <p className="mt-1 text-ui text-text-muted">{message}</p>
    </div>
  );
}
