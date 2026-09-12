import { randomUUID } from "node:crypto";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

export const s3Client = new S3Client({ region: env.AWS_REGION });

export function buildNoteFileKey(noteId: string, originalFilename: string): string {
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `notes/${noteId}/${randomUUID()}-${safeName}`;
}

export async function getPresignedPutUrl(key: string, mimeType: string, expiresInSeconds = 900): Promise<string> {
  const command = new PutObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key, ContentType: mimeType });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function getPresignedGetUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const command = new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Same as getPresignedGetUrl, but overrides the response headers so the
 * browser renders the object inline (in an <iframe>/<img>) instead of
 * prompting a download — the override lives on the presigned request, not
 * on the stored object, so it doesn't affect getPresignedGetUrl callers.
 */
export async function getPresignedInlineUrl(
  key: string,
  contentType: string,
  filename: string,
  expiresInSeconds = 300
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: `inline; filename="${filename.replace(/["\\]/g, "_")}"`,
  });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Best-effort bulk delete — callers should not let a storage-side failure
 * here block whatever DB-level operation (e.g. deleting a note) already
 * succeeded; the DB is the source of truth for what still exists, so a
 * failed object delete just leaves storage bytes orphaned rather than
 * corrupting state. S3 DeleteObjects is a no-op (not an error) for keys
 * that don't exist, so this is also safe to call on files with no real
 * uploaded bytes.
 */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await s3Client.send(
    new DeleteObjectsCommand({
      Bucket: env.AWS_S3_BUCKET,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    })
  );
}
