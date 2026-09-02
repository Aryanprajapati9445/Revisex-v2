import { describe, expect, it } from "vitest";
import { buildPaginationMeta, parsePagination } from "../../src/lib/pagination.js";

describe("parsePagination", () => {
  it("defaults to page 1, limit 20", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it("computes offset from page and limit", () => {
    expect(parsePagination({ page: "3", limit: "10" })).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it("clamps limit to a maximum of 100", () => {
    expect(() => parsePagination({ limit: "1000" })).toThrow();
  });

  it("rejects page below 1", () => {
    expect(() => parsePagination({ page: "0" })).toThrow();
  });
});

describe("buildPaginationMeta", () => {
  it("computes totalPages, rounding up", () => {
    expect(buildPaginationMeta(1, 20, 45)).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3 });
  });

  it("returns at least 1 page when total is 0", () => {
    expect(buildPaginationMeta(1, 20, 0)).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });
});
