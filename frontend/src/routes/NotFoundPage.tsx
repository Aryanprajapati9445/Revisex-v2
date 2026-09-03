import { Link } from "react-router-dom";
import { ErrorState } from "@/components/layout/ErrorState";
import { ApiError } from "@/lib/api-client";

/**
 * An unrecognised URL. Reuses ErrorState so the copy matches a 404 served by
 * the API — the backend masks out-of-scope resources as 404 too, and a visitor
 * should not be able to tell the two apart.
 */
export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4">
      <ErrorState error={new ApiError(404, "NOT_FOUND", "Page not found")} />
      <Link to="/" className="text-ui underline">
        Back to browse
      </Link>
    </div>
  );
}
