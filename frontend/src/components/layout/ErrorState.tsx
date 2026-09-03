import { AlertTriangle, Clock, SearchX } from "lucide-react";
import { ApiError } from "@/lib/api-client";

function StateIcon({ icon: Icon }: { icon: typeof AlertTriangle }) {
  return (
    <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-background text-text-tertiary shadow-raised">
      <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/**
 * The single place error copy is decided, so the 404-masking rule is enforced
 * once rather than in every screen.
 */
export function ErrorState({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.status === 501) {
    return (
      <div role="status" className="flex flex-col items-center rounded-panel bg-surface px-6 py-10 text-center">
        <StateIcon icon={Clock} />
        <p className="text-base font-medium">Not available yet</p>
        <p className="mt-1 text-ui text-text-muted">This part of the platform hasn’t been built yet.</p>
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    // Deliberately says nothing about permissions: the backend returns 404 for
    // both "missing" and "out of your scope" so the two cannot be told apart.
    return (
      <div role="alert" className="flex flex-col items-center rounded-panel bg-surface px-6 py-10 text-center">
        <StateIcon icon={SearchX} />
        <p className="text-base font-medium">Not found</p>
        <p className="mt-1 text-ui text-text-muted">We couldn’t find what you were looking for.</p>
      </div>
    );
  }

  const message =
    error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

  return (
    <div role="alert" className="flex flex-col items-center rounded-panel bg-surface px-6 py-10 text-center">
      <StateIcon icon={AlertTriangle} />
      <p className="text-base font-medium">Something went wrong</p>
      <p className="mt-1 text-ui text-text-muted">{message}</p>
    </div>
  );
}
