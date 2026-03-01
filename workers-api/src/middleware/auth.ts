/**
 * JWT Authentication Middleware for Hono
 */
import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import * as jose from "jose";
import type { Env, JWTPayload, UserContext } from "../types";

// Hono Variables type
declare module "hono" {
  interface ContextVariableMap {
    user: UserContext;
  }
}

/**
 * JWT 인증 미들웨어 - 모든 보호된 라우트에 적용
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "인증 토큰이 필요합니다" });
  }

  const token = authHeader.slice(7);

  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    const jwtPayload = payload as unknown as JWTPayload;

    c.set("user", {
      userId: jwtPayload.userId,
      email: jwtPayload.sub,
      role: jwtPayload.role,
    });

    await next();
  } catch {
    throw new HTTPException(401, { message: "유효하지 않은 토큰입니다" });
  }
}

/**
 * 관리자 전용 미들웨어
 */
export async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get("user");
  if (user.role !== "admin") {
    throw new HTTPException(403, { message: "관리자 권한이 필요합니다" });
  }
  await next();
}

/**
 * 결재자 이상 권한 미들웨어
 */
export async function requireApprover(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get("user");
  if (user.role !== "admin" && user.role !== "approver") {
    throw new HTTPException(403, { message: "결재 권한이 필요합니다" });
  }
  await next();
}

/**
 * JWT 토큰 생성
 */
export async function createToken(
  env: Env,
  userId: number,
  email: string,
  role: string
): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const expMinutes = parseInt(env.JWT_EXPIRE_MINUTES || "1440");

  const token = await new jose.SignJWT({
    sub: email,
    userId,
    role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expMinutes}m`)
    .sign(secret);

  return token;
}
