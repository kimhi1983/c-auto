/**
 * Cloudflare Workers Environment Bindings
 */
export interface Env {
  // D1 Database
  DB: D1Database;
  // KV Namespace (cache)
  CACHE: KVNamespace;
  // R2 Bucket (file storage)
  FILES: R2Bucket;

  // Secrets (set via wrangler secret put)
  ANTHROPIC_API_KEY: string;
  GOOGLE_API_KEY: string;
  JWT_SECRET: string;
  HIWORKS_CLIENT_ID: string;
  HIWORKS_CLIENT_SECRET: string;
  EMAIL_USER: string;
  EMAIL_PASS: string;

  // Vars
  ENVIRONMENT: string;
  JWT_ALGORITHM: string;
  JWT_EXPIRE_MINUTES: string;
  CORS_ORIGIN: string;
}

export interface JWTPayload {
  sub: string; // user email
  userId: number;
  role: string;
  exp: number;
}

export interface UserContext {
  userId: number;
  email: string;
  role: string;
}
