import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { buildNoteFileKey, getPresignedGetUrl, getPresignedPutUrl, s3Client } from "../../src/lib/s3.js";

const s3Mock = mockClient(s3Client);

beforeEach(() => {
  s3Mock.reset();
});

describe("buildNoteFileKey", () => {
  it("namespaces the key under the note id and sanitizes the filename", () => {
    const key = buildNoteFileKey("11111111-1111-1111-1111-111111111111", "my notes (final)!.pdf");
    expect(key.startsWith("notes/11111111-1111-1111-1111-111111111111/")).toBe(true);
    expect(key).not.toMatch(/[()! ]/);
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("produces a different key each call for the same filename", () => {
    const a = buildNoteFileKey("note-1", "same.pdf");
    const b = buildNoteFileKey("note-1", "same.pdf");
    expect(a).not.toBe(b);
  });
});

describe("presigned URLs", () => {
  it("returns a signed PUT URL", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const url = await getPresignedPutUrl("notes/x/y.pdf", "application/pdf");
    expect(url).toContain("http");
  });

  it("returns a signed GET URL", async () => {
    s3Mock.on(GetObjectCommand).resolves({});
    const url = await getPresignedGetUrl("notes/x/y.pdf");
    expect(url).toContain("http");
  });
});
