const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  // Declared and assigned explicitly rather than as constructor parameter
  // properties: the scaffold enables `erasableSyntaxOnly`, which rejects that
  // syntax (TS1294) because it cannot be erased to plain JavaScript.
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /**
   * The backend formats validation messages as "field: reason" (see
   * errorHandler.ts). Forms use this to attach the error to the right input
   * instead of dumping it in a toast.
   */
  get fieldName(): string | null {
    if (this.code !== "VALIDATION_ERROR") return null;
    const match = /^([A-Za-z_][A-Za-z0-9_.]*):\s/.exec(this.message);
    return match ? match[1]! : null;
  }

  /** The message with the "field: " prefix stripped, for display next to an input. */
  get fieldMessage(): string {
    const name = this.fieldName;
    return name ? this.message.slice(name.length + 1).trim() : this.message;
  }
}

let accessToken: string | null = null;
let refreshHandler: (() => Promise<boolean>) | null = null;
let inFlightRefresh: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Called on a 401. Returns true if it obtained a new access token (the request
 * is then retried once), false to give up. AuthProvider installs this.
 */
export function setRefreshHandler(handler: (() => Promise<boolean>) | null): void {
  refreshHandler = handler;
  inFlightRefresh = null;
}

/**
 * Many queries can 401 at once on a stale token. Without this, each would
 * trigger its own refresh and all but one would fail on a rotated token.
 */
function refreshOnce(): Promise<boolean> {
  if (!refreshHandler) return Promise.resolve(false);
  if (!inFlightRefresh) {
    inFlightRefresh = refreshHandler().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  /**
   * Skip the 401 -> refresh -> retry cycle for this request.
   *
   * The refresh call itself MUST set this. Without it, a rejected refresh
   * token deadlocks: the 401 triggers refreshOnce(), whose handler calls this
   * same endpoint, and that inner call then awaits the very in-flight refresh
   * promise it is running inside — so neither ever settles.
   */
  skipAuthRefresh?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    if (body && body.success === false && body.error) {
      return new ApiError(response.status, body.error.code ?? "INTERNAL_ERROR", body.error.message ?? "Request failed");
    }
  } catch {
    // Non-JSON body (proxy error page, gateway timeout) — fall through.
  }
  return new ApiError(response.status, "INTERNAL_ERROR", `Request failed with status ${response.status}`);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  query?: Query,
  isRetry = false,
  options?: RequestOptions
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && !isRetry && !options?.skipAuthRefresh) {
    const refreshed = await refreshOnce();
    if (refreshed) return request<T>(method, path, body, query, true, options);
  }

  if (!response.ok) throw await toApiError(response);

  if (response.status === 204) return undefined as T;

  const payload = await response.json();
  return payload.data as T;
}

export const api = {
  get: <T>(path: string, query?: Query, options?: RequestOptions) =>
    request<T>("GET", path, undefined, query, false, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, undefined, false, options),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/**
 * Uploads a file straight to S3 with a presigned PUT. Deliberately NOT routed
 * through request(): a presigned URL carries its own signature, and adding an
 * Authorization header invalidates it.
 */
export async function putToPresignedUrl(url: string, file: File): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!response.ok) {
    throw new ApiError(response.status, "UPLOAD_FAILED", `Upload failed with status ${response.status}`);
  }
}
