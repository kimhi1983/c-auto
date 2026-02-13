import { z } from 'zod';

/**
 * Cloudflare Workers Environment Bindings
 */
export interface Env {
  // D1 Database
  DB: D1Database;
  // KV Namespace (cache) - optional until enabled
  CACHE: KVNamespace;
  // R2 Bucket (file storage) - optional until R2 enabled in Dashboard
  FILES: R2Bucket;

  // Secrets (set via wrangler secret put)
  ANTHROPIC_API_KEY: string;
  GOOGLE_API_KEY: string;
  JWT_SECRET: string;

  // Vars
  ENVIRONMENT: string;
  JWT_EXPIRE_MINUTES: string;
  ALLOWED_ORIGINS: string;
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

// --- Zod Schemas for Validation ---

// Corresponds to Python's UserRole enum
export const UserRoleSchema = z.enum([
  'admin',
  'approver',
  'staff',
  'viewer',
]);

// Corresponds to Python's UserLogin schema
export const UserLoginSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

// Corresponds to Python's UserCreate schema
export const UserCreateSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  full_name: z.string().min(2, "Full name must be at least 2 characters").max(100),
  role: UserRoleSchema.default('staff'),
  department: z.string().max(50).optional().nullable(), // .nullable() to allow null from JSON
});

// Corresponds to Python's UserUpdate schema
export const UserUpdateSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters").max(100).optional(),
  department: z.string().max(50).optional().nullable(),
  role: UserRoleSchema.optional(),
  is_active: z.boolean().optional(),
});
