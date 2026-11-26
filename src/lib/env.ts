import type { Client } from "pg";

export type Bindings = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  STORAGE_BUCKET?: string;
  AWS_ENDPOINT_URL_S3?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  CORS_ORIGINS?: string;
};

export type Variables = { db: Client };

export type AppEnv = { Bindings: Bindings; Variables: Variables };

export function connectionString(env: Bindings): string | undefined {
  return env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
}

export function storageConfig(env: Bindings) {
  const {
    AWS_ENDPOINT_URL_S3: endpoint,
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
    AWS_REGION: region,
  } = env;
  if (!endpoint || !accessKeyId || !secretAccessKey || !region) return null;
  return { endpoint, accessKeyId, secretAccessKey, region, bucket: env.STORAGE_BUCKET ?? "uploads" };
}

export function allowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
