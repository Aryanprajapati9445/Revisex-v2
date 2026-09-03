import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, setAccessToken, setRefreshHandler } from "./api-client";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  setAccessToken(null);
  setRefreshHandler(null);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("api-client", () => {
  it("unwraps the success envelope", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ success: true, data: { id: "1" } })) as never;

    await expect(api.get("/api/programs")).resolves.toEqual({ id: "1" });
  });

  it("throws ApiError carrying the backend code", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ success: false, error: { code: "NOT_FOUND", message: "Note not found" } }, 404)
    ) as never;

    await expect(api.get("/api/notes/x")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Note not found",
    });
  });

  it("extracts the field name from a validation message", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        { success: false, error: { code: "VALIDATION_ERROR", message: "title: String must contain at least 1 character(s)" } },
        422
      )
    ) as never;

    const error = await api.post("/api/notes", {}).catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fieldName).toBe("title");
  });

  it("sends the bearer token when one is set", async () => {
    // Parameters are declared so the recorded call tuple is typed as fetch's
    // (input, init) rather than inferred as empty, which makes calls[0][1] a
    // compile error under the scaffold's strict settings.
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ success: true, data: null })
    );
    globalThis.fetch = fetchMock as never;
    setAccessToken("tok123");

    await api.get("/api/users/me");

    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer tok123");
  });

  it("refreshes once on 401 and retries the original request", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse({ success: false, error: { code: "UNAUTHENTICATED", message: "expired" } }, 401);
      }
      return jsonResponse({ success: true, data: { ok: true } });
    }) as never;

    const refresh = vi.fn(async () => {
      setAccessToken("fresh");
      return true;
    });
    setRefreshHandler(refresh);

    await expect(api.get("/api/users/me")).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(call).toBe(2);
  });

  it("does not retry a second time when the refresh itself fails", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ success: false, error: { code: "UNAUTHENTICATED", message: "expired" } }, 401)
    );
    globalThis.fetch = fetchMock as never;
    setRefreshHandler(async () => false);

    await expect(api.get("/api/users/me")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one refresh across concurrent 401s", async () => {
    let refreshed = false;
    globalThis.fetch = vi.fn(async () => {
      if (!refreshed) {
        return jsonResponse({ success: false, error: { code: "UNAUTHENTICATED", message: "expired" } }, 401);
      }
      return jsonResponse({ success: true, data: { ok: true } });
    }) as never;

    const refresh = vi.fn(async () => {
      refreshed = true;
      setAccessToken("fresh");
      return true;
    });
    setRefreshHandler(refresh);

    await Promise.all([api.get("/api/a"), api.get("/api/b"), api.get("/api/c")]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("surfaces a non-JSON response as an INTERNAL_ERROR ApiError", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<html>502</html>", { status: 502 })) as never;

    await expect(api.get("/api/programs")).rejects.toMatchObject({
      status: 502,
      code: "INTERNAL_ERROR",
    });
  });
});
