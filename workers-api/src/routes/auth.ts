/**
 * Authentication Routes - /api/v1/auth
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { hash, compare } from "bcryptjs";
import { users } from "../db/schema";
import { createToken, authMiddleware } from "../middleware/auth";
import type { Env } from "../types";

const auth = new Hono<{ Bindings: Env }>();

/**
 * POST /auth/login - 로그인
 */
auth.post("/login", async (c) => {
  let email: string;
  let password: string;

  // form-encoded (프론트엔드 호환) 또는 JSON 지원
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await c.req.parseBody();
    email = (formData.username || formData.email) as string;
    password = formData.password as string;
  } else {
    const body = await c.req.json<{ email?: string; username?: string; password: string }>();
    email = body.email || body.username || "";
    password = body.password;
  }

  if (!email || !password) {
    return c.json({ detail: "이메일과 비밀번호를 입력하세요" }, 400);
  }

  const db = drizzle(c.env.DB);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || !user.isActive) {
    return c.json({ detail: "이메일 또는 비밀번호가 올바르지 않습니다" }, 401);
  }

  const valid = await compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ detail: "이메일 또는 비밀번호가 올바르지 않습니다" }, 401);
  }

  const token = await createToken(c.env, user.id, user.email, user.role);

  return c.json({
    access_token: token,
    token_type: "bearer",
    user: {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      department: user.department,
    },
  });
});

/**
 * POST /auth/register - 관리자 전용 사용자 등록
 */
auth.post("/register", authMiddleware, async (c) => {
  const currentUser = c.get("user");
  if (currentUser.role !== "admin") {
    return c.json({ error: "관리자 권한이 필요합니다" }, 403);
  }

  const body = await c.req.json<{
    email: string;
    password: string;
    full_name: string;
    role?: string;
    department?: string;
  }>();

  if (!body.email || !body.password || !body.full_name) {
    return c.json({ error: "필수 정보를 입력하세요" }, 400);
  }

  const db = drizzle(c.env.DB);

  // 이메일 중복 확인
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  if (existing) {
    return c.json({ error: "이미 등록된 이메일입니다" }, 409);
  }

  const passwordHash = await hash(body.password, 12);

  const [newUser] = await db
    .insert(users)
    .values({
      email: body.email,
      passwordHash,
      fullName: body.full_name,
      role: (body.role as any) || "staff",
      department: body.department,
    })
    .returning();

  return c.json(
    {
      id: newUser.id,
      email: newUser.email,
      full_name: newUser.fullName,
      role: newUser.role,
      department: newUser.department,
    },
    201
  );
});

/**
 * GET /auth/me - 현재 사용자 정보
 */
auth.get("/me", authMiddleware, async (c) => {
  const currentUser = c.get("user");
  const db = drizzle(c.env.DB);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUser.userId))
    .limit(1);

  if (!user) {
    return c.json({ error: "사용자를 찾을 수 없습니다" }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    role: user.role,
    department: user.department,
    is_active: user.isActive,
    created_at: user.createdAt,
  });
});

/**
 * POST /auth/logout - 로그아웃 (stateless)
 */
auth.post("/logout", (c) => {
  return c.json({ message: "로그아웃 되었습니다" });
});

export default auth;
