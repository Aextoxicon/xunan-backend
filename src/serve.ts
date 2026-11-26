import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./index.js";

const port = Number(process.env.PORT ?? 3000);

const bindings = {
  DATABASE_URL: process.env.DATABASE_URL,
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  AWS_ENDPOINT_URL_S3: process.env.AWS_ENDPOINT_URL_S3,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: process.env.AWS_REGION,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_TTL_DAYS: process.env.JWT_TTL_DAYS,
};

serve({ fetch: (request) => app.fetch(request, bindings), port }, (info) => {
  console.log(`xunan-server listening on http://localhost:${info.port}`);
});
