/**
 * User Management Routes - /api/v1/users (Admin only)
 */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc } from "drizzle-orm";
import { hash } from "bcryptjs";
import { users } from "../db/schema";
import { authMiddleware, requireAdmin } from "../middleware/auth";
import type { Env } from "../types";

const usersRouter = new Hono<{ Bindings: Env }>();

usersRouter.use("*", authMiddleware, requireAdmin);

/**
 * GET /users - 사용자 목록
 */
usersRouter.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      department: users.department,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  // 프론트엔드 호환: snake_case 필드 + 배열 직접 반환
  const result = allUsers.map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    role: u.role,
    department: u.department,
    is_active: u.isActive,
    created_at: u.createdAt,
  }));

  return c.json(result);
});

/**
 * GET /users/:id - 사용자 상세
 */
usersRouter.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const db = drizzle(c.env.DB);

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      department: users.department,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    return c.json({ error: "사용자를 찾을 수 없습니다" }, 404);
  }

  return c.json(user);
});

/**
 * PATCH /users/:id - 사용자 수정
 */
usersRouter.patch("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<{
    full_name?: string;
    role?: string;
    department?: string;
    is_active?: boolean;
    password?: string;
  }>();

  const db = drizzle(c.env.DB);
  const updateData: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.full_name) updateData.fullName = body.full_name;
  if (body.role) updateData.role = body.role;
  if (body.department !== undefined) updateData.department = body.department;
  if (body.is_active !== undefined) updateData.isActive = body.is_active;
  if (body.password) updateData.passwordHash = await hash(body.password, 12);

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "사용자를 찾을 수 없습니다" }, 404);
  }

  return c.json({
    id: updated.id,
    email: updated.email,
    full_name: updated.fullName,
    role: updated.role,
    department: updated.department,
    is_active: updated.isActive,
  });
});

export default usersRouter;
