import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { AwsClient } from "aws4fetch";
import { ApiError, okJson } from "../lib/http.js";
import { toCst } from "../lib/time.js";
import { storageConfig } from "../lib/env.js";
import { positiveInt } from "../lib/validation.js";
import type { AppEnv } from "../lib/env.js";

const presignSchema = z.object({
  file_name: z.string().min(1),
  content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  file_size: positiveInt.max(10 * 1024 * 1024),
});

const uploads = new Hono<AppEnv>();

const objectKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "非法对象 key")
  .refine((key) => !key.includes(".."), "非法对象 key");

function signerFor(storage: NonNullable<ReturnType<typeof storageConfig>>): AwsClient {
  return new AwsClient({
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey,
    service: "s3",
    region: storage.region,
  });
}

uploads.get("/uploads/presign", async (c) => {
  const storage = storageConfig(c.env);
  if (!storage) {
    throw new ApiError(503, "storage_not_configured");
  }
  const parsed = objectKeySchema.safeParse(c.req.query("key") ?? "");
  if (!parsed.success) {
    throw new ApiError(400, "validation_error", parsed.error.issues);
  }
  const objectKey = parsed.data;
  const target = new URL(`${storage.endpoint.replace(/\/$/, "")}/${storage.bucket}/${objectKey}`);
  target.searchParams.set("X-Amz-Expires", "300");
  const signed = await signerFor(storage).sign(target.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return okJson(c, {
    object_key: objectKey,
    download_url: String(signed.url),
    method: "GET",
    expires_at: toCst(new Date(Date.now() + 300_000)),
  });
});

uploads.post(
  "/uploads/presign",
  zValidator("json", presignSchema, (result) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const storage = storageConfig(c.env);
    if (!storage) {
      throw new ApiError(503, "storage_not_configured");
    }
    const body = c.req.valid("json");
    const ext = body.file_name.split(".").pop()?.toLowerCase() || "bin";
    const objectKey = `${crypto.randomUUID()}.${ext}`;
    const target = new URL(`${storage.endpoint.replace(/\/$/, "")}/${storage.bucket}/${objectKey}`);
    target.searchParams.set("X-Amz-Expires", "300");
    const signed = await signerFor(storage).sign(target.toString(), {
      method: "PUT",
      headers: { "Content-Type": body.content_type },
      aws: { signQuery: true },
    });
    return okJson(c, {
      object_key: objectKey,
      upload_url: String(signed.url),
      method: "PUT",
      headers: { "Content-Type": body.content_type },
      expires_at: toCst(new Date(Date.now() + 300_000)),
    });
  },
);

export default uploads;
