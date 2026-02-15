import { z } from 'zod';

/**
 * Cloudflare Workers Environment Bindings
 */
export interface Env {
  // D1 Database
  DB: D1Database;
  // KV Namespace (cache) - optional until enabled in Dashboard
  CACHE?: KVNamespace;
  // R2 Bucket (file storage) - optional until R2 enabled in Dashboard
  FILES?: R2Bucket;
  // Workers AI
  AI: Ai;

  // Secrets (set via wrangler secret put)
  JWT_SECRET: string;

  // AI API Keys (멀티모델 아키텍처)
  GEMINI_API_KEY?: string;      // Gemini Flash - 분류/요약/스팸필터 (90%)
  ANTHROPIC_API_KEY?: string;   // Claude Haiku 4.5 + Sonnet 4.5 (8%+2%)

  // Gmail OAuth2 (하이웍스→Gmail POP3 포워딩 후 Gmail API로 메일 조회)
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;

  // Dropbox OAuth2 (KPROS 자료대응 파일 검색)
  DROPBOX_APP_KEY?: string;
  DROPBOX_APP_SECRET?: string;

  // 이카운트 ERP API
  ECOUNT_COM_CODE?: string;      // 회사코드
  ECOUNT_USER_ID?: string;       // 사용자 ID
  ECOUNT_API_CERT_KEY?: string;  // API 인증키

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

// 로그인 스키마 (ID + 비밀번호)
export const UserLoginSchema = z.object({
  email: z.string().min(1, { message: "아이디를 입력하세요" }),
  password: z.string().min(1, { message: "비밀번호를 입력하세요" }),
});

// 사용자 생성 스키마 (ID 형식)
export const UserCreateSchema = z.object({
  email: z.string().min(2, "아이디는 2자 이상이어야 합니다").max(50, "아이디는 50자 이하여야 합니다"),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다"),
  full_name: z.string().min(2, "이름은 2자 이상이어야 합니다").max(100),
  role: UserRoleSchema.default('staff'),
  department: z.string().max(50).optional().nullable(),
});

// Corresponds to Python's UserUpdate schema
export const UserUpdateSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters").max(100).optional(),
  department: z.string().max(50).optional().nullable(),
  role: UserRoleSchema.optional(),
  is_active: z.boolean().optional(),
});
