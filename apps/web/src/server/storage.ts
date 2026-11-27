import "server-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * File storage. STORAGE_DRIVER=s3 uses any S3-compatible bucket (MinIO in docker compose);
 * otherwise files go to ./.uploads (dev without MinIO). Keys are always prefixed by the org id,
 * and files are served through /api/files/... which checks the session's organisation.
 */
const driver = () => (process.env.STORAGE_DRIVER ?? (process.env.NODE_ENV === "production" ? "s3" : "local"));
const localRoot = () => path.resolve(process.cwd(), ".uploads");
let s3: S3Client | null = null;
function client() {
  s3 ??= new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" } });
  return s3;
}

const ALLOWED = new Map([["application/pdf", "pdf"], ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["image/heic", "heic"]]);
export const MAX_UPLOAD = 8 * 1024 * 1024;

export async function saveUpload(organizationId: string, folder: string, file: File): Promise<{ key: string; url: string; size: number; mimeType: string }> {
  const ext = ALLOWED.get(file.type);
  if (!ext) throw new Error("Format non accepté : PDF, JPG, PNG ou WEBP.");
  if (file.size > MAX_UPLOAD) throw new Error("Fichier trop volumineux (8 Mo maximum).");
  const key = `${organizationId}/${folder}/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  const body = Buffer.from(await file.arrayBuffer());
  await putBuffer(key, body, file.type);
  return { key, url: `/api/files/${key}`, size: file.size, mimeType: file.type };
}

export async function putBuffer(key: string, body: Buffer | Uint8Array, contentType: string) {
  if (driver() === "s3") {
    await client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET ?? "yghr", Key: key, Body: body, ContentType: contentType }));
  } else {
    const p = path.join(localRoot(), key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }
}

export async function readObject(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (key.includes("..")) return null;
  try {
    if (driver() === "s3") {
      const r = await client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET ?? "yghr", Key: key }));
      return { body: await r.Body!.transformToByteArray(), contentType: r.ContentType ?? "application/octet-stream" };
    }
    const body = await fs.readFile(path.join(localRoot(), key));
    const ext = key.split(".").pop()!;
    const type = [...ALLOWED.entries()].find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
    return { body, contentType: type };
  } catch {
    return null;
  }
}
