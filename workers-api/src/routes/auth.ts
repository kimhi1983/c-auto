/**
 * Authentication Routes - /api/v1/auth
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { hash, compare } from "bcryptjs";
import { users } from "../db/schema";
import { createToken, authMiddleware } from "../middleware/auth";
import { Env, UserLoginSchema, UserCreateSchema } from "../types";

const auth = new Hono<{ Bindings: Env }>();

/**
 * POST /auth/register - 관리자 전용 사용자 등록
 */
auth.post(
  "/register",
  authMiddleware,
  zValidator("json", UserCreateSchema),
  async (c) => {
    const currentUser = c.get("user");
    if (currentUser.role !== "admin") {
      return c.json({ error: "관리자 권한이 필요합니다" }, 403);
    }

    const body = c.req.valid("json");
    const db = drizzle(c.env.DB);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    if (existing) {
      return c.json({ error: "이미 등록된 이메일입니다" }, 409);
    }

    const hashedPassword = await hash(body.password, 12);

    const [newUser] = await db
      .insert(users)
      .values({
        email: body.email,
        passwordHash: hashedPassword,
        fullName: body.full_name,
        role: body.role,
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
  }
);

/**
 * POST /auth/login - 로그인
 */
auth.post("/login", zValidator("json", UserLoginSchema), async (c) => {
  const body = c.req.valid("json");
  const db = drizzle(c.env.DB);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);

  if (!user || !user.isActive) {
    return c.json({ detail: "이메일 또는 비밀번호가 올바르지 않습니다" }, 401);
  }

  const valid = await compare(body.password, user.passwordHash);
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
