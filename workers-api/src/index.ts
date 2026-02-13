/**
 * C-Auto v3.0 - Cloudflare Workers API
 * Hono.js + D1 + R2 + KV
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./types";

// Routes
import auth from "./routes/auth";
import usersRouter from "./routes/users";
import emailsRouter from "./routes/emails";
import aiDocs from "./routes/ai-docs";
import files from "./routes/files";
import archives from "./routes/archives";
import inventory from "./routes/inventory";
import rates from "./routes/exchange-rates";

const app = new Hono<{ Bindings: Env }>();

// ─── Middleware ───

// Logger
app.use("*", logger());

// CORS
app.use("*", async (c, next) => {
  const corsMiddleware = cors({
    origin: [
      c.env.CORS_ORIGIN || "https://c-auto.kimhi1983.com",
      "http://localhost:3003",
      "http://localhost:3000",
    ],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });
  return corsMiddleware(c, next);
});

// ─── Health Check ───

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "3.0.0",
    platform: "cloudflare-workers",
    timestamp: new Date().toISOString(),
  });
});

// ─── API v1 Routes ───

app.route("/api/v1/auth", auth);
app.route("/api/v1/users", usersRouter);
app.route("/api/v1/emails", emailsRouter);
app.route("/api/v1/ai-docs", aiDocs);
app.route("/api/v1/files", files);
app.route("/api/v1/archives", archives);
app.route("/api/v1/inventory", inventory);
app.route("/api/v1/exchange-rates", rates);

// ─── 프론트엔드 호환 경로 (레거시) ───

// /search-files → /api/v1/files/search (redirect)
app.get("/search-files", (c) => {
  const keyword = c.req.query("keyword") || "";
  return c.redirect(`/api/v1/files/search?keyword=${encodeURIComponent(keyword)}`);
});

// /api/inventory → /api/v1/inventory (redirect)
app.get("/api/inventory", (c) => c.redirect("/api/v1/inventory"));

// /api/inventory/transaction → /api/v1/inventory/transaction
app.post("/api/inventory/transaction", async (c) => {
  const url = new URL(c.req.url);
  url.pathname = "/api/v1/inventory/transaction";
  return app.fetch(new Request(url.toString(), c.req.raw), c.env);
});

// ─── API Status ───

app.get("/api/status", (c) => {
  return c.json({
    status: "success",
    message: "C-Auto v3.0 API 정상 작동 중",
    platform: "Cloudflare Workers",
    endpoints: {
      auth: "/api/v1/auth",
      users: "/api/v1/users",
      emails: "/api/v1/emails",
      "ai-docs": "/api/v1/ai-docs",
      files: "/api/v1/files",
      archives: "/api/v1/archives",
      inventory: "/api/v1/inventory",
      "exchange-rates": "/api/v1/exchange-rates",
    },
  });
});

// ─── Error Handler ───

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  console.error("Unhandled error:", err);
  return c.json({ error: "서버 오류가 발생했습니다" }, 500);
});

// ─── 404 Handler ───

app.notFound((c) => {
  return c.json({ error: "요청한 리소스를 찾을 수 없습니다" }, 404);
});

export default app;
