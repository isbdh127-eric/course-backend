//console.log("BOOT:", __filename, new Date().toISOString());
import dotenv from "dotenv";
import courseRoutes from "./course.routes.js";
dotenv.config();
console.log("BOOT VERSION: 2026-01-18 A");
import cookieParser from "cookie-parser";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import express from "express";
import plannerRoutes from "./planner.routes.js";
const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3000);
app.get("/health", (req, res) => res.send("ok"));
const { runMigrate } = require("./scripts/migrate_raw_to_sections.cjs");

// 觸發雲端轉換：rawCourse -> course/section/schedule
app.post("/api/admin/migrate", requireImportSecret, async (req, res) => {
  try {
    await runMigrate();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "MIGRATE_FAILED", detail: String(e?.message || e) });
  }
});

/* =======================
   Middlewares
======================= */
app.use(express.json());
app.use(cookieParser());
app.use("/api/courses", courseRoutes);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
    credentials: true,
  })
);

app.use((req, res, next) => {
  console.log("REQ:", req.method, req.url);
  next();
});
app.use((err, req, res, next) => {
  console.error("[server.js:L40] ERROR =", err);
  console.error("[server.js:L40] STACK =", err?.stack);

  const status = err?.statusCode || err?.status || 500;

  // 開發用：把 message 也回傳，方便你抓原因
  return res.status(status).json({
    error: status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
    message: err?.message || "unknown",
    type: err?.type || null,
  });
});

function requireImportSecret(req, res, next) {
  const secret = process.env.IMPORT_SECRET || "";
  const got = req.headers["x-import-secret"] || "";
  if (!secret || got !== secret) {
    return res.status(401).json({ ok: false, message: "UNAUTHORIZED_IMPORT" });
  }
  next();
}

// 匯入 raw courses（分批）
app.post("/api/admin/import/raw-courses", requireImportSecret, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ ok: false, message: "EMPTY_ITEMS" });

    // 你 rawCourse 欄位若不同，下面請對應你 schema 改一下
    // 建議 rawCourse 至少要有: name, teacher, credits, term(或semester), rawId(或代碼/流水號)
 const created = await prisma.rawCourse.createMany({
  data: items,
  skipDuplicates: true,
});


    res.json({ ok: true, inserted: created.count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "IMPORT_FAILED" });
  }
});

// （可選）清空 rawCourse，避免重灌重複
app.post("/api/admin/clear/raw-courses", requireImportSecret, async (req, res) => {
  try {
    const r = await prisma.rawCourse.deleteMany({});
    res.json({ ok: true, deleted: r.count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "CLEAR_FAILED" });
  }
});

const { runMigrate } = require("./scripts/migrate_raw_to_sections.cjs");

app.post("/api/admin/migrate", requireImportSecret, async (req, res) => {
  try {
    await runMigrate();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "MIGRATE_FAILED" });
  }
});

//健康檢查
app.get("/health", (req, res) => res.send("ok"));

/* =======================
   Utils / Config
======================= */
function needReLogin(res) {
  return res.status(401).json({
    ok: false,
    code: "NEED_RELOGIN",
    message: "請重新登入",
  });
}

function getAccessSecret() {
  return (
    process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_SECRET ||
    null
  );
}

function accessTtl() {
  return process.env.ACCESS_TOKEN_TTL || "15m";
}

// 允許用 .env 控制（沒有就用 14 天）
function refreshTtlMs() {
  const days = Number(process.env.REFRESH_DAYS || 14);
  return days * 24 * 60 * 60 * 1000;
}

// refresh token 本體：高熵隨機值（只給前端 cookie，不存 DB）
function generateRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

// DB 只存 hash
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isProd() {
  return process.env.NODE_ENV === "production";
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd(), // ✅ production 才要求 https
    sameSite: "lax",
    path: "/api/auth/refresh",
    maxAge: refreshTtlMs(),
  };
}

function setRefreshCookie(res, token) {
  res.cookie("refresh_token", token, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  // ✅ 清除 cookie 時要用「同一組 options 的關鍵欄位」
  res.clearCookie("refresh_token", {
    path: "/api/auth/refresh",
    sameSite: "lax",
    secure: isProd(),
  });
}
function authError(res, code, message = "請重新登入", status = 401) {
  return res.status(status).json({ ok: false, code, message });
}

/* =======================
   Auth middleware
======================= */
function requireAuth(req, res, next) {
  const secret = getAccessSecret();
  const auth = req.headers.authorization || "";
  const [type, token] = auth.split(" ");

  if (!secret || type !== "Bearer" || !token) {
    return authError(res, "ACCESS_INVALID");
  }

  try {
    const payload = jwt.verify(token, secret);
    req.userId = payload.sub;
    next();
  } catch {
    return authError(res, "ACCESS_INVALID");
  }
}

app.use("/api/planner", plannerRoutes);
/* =======================
   Health
======================= */
app.get("/", (_, res) => res.send("選課系統後端正在運作中 🚀"));
app.get("/__whoami", (_, res) =>
  res.json({ file: __filename, time: new Date().toISOString() })
);








/* =======================
   Auth APIs
======================= */
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, username } = req.body ?? {};
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ ok: false, message: "註冊資料不完整" });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return res.status(409).json({ ok: false, message: "Email 已被註冊" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, username: username ?? null, passwordHash },
      select: { id: true, email: true, username: true, createdAt: true },
    });

    res.json({ ok: true, data: user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "SERVER_ERROR" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const secret = getAccessSecret();

    console.log("[LOGIN] email=", email, "hasPassword=", !!password, "secretLen=", String(secret || "").length);

    if (!email || !password || !secret) {
      return res.status(400).json({ ok: false, message: "登入失敗" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    console.log("[LOGIN] foundUser=", !!user);

    if (!user) return authError(res, "ACCESS_INVALID");

    console.log("[LOGIN] hashPrefix=", String(user.passwordHash || "").slice(0, 4)); // 看是不是 $2b$ / $2a$

    const ok = await bcrypt.compare(password, user.passwordHash);
    console.log("[LOGIN] passwordMatch=", ok);

    if (!ok) return authError(res, "ACCESS_INVALID");

    const accessToken = jwt.sign({ sub: user.id }, secret, { expiresIn: accessTtl() });

    const refreshToken = generateRefreshToken();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtlMs()),
      },
    });

    setRefreshCookie(res, refreshToken);
    res.json({ ok: true, accessToken });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "SERVER_ERROR" });
  }
});


/**
 * ✅ Refresh（Rotation + Reuse detection）
 * - 正常：舊 token revoke，建立新 token row，回傳新 access，並更新 cookie
 * - 異常：如果 token 已 revoked 還被拿來用 → 視為 refresh token 外洩/重放
 *        直接撤銷該 user 全部有效 refresh（強制全裝置重登）
 */
app.post("/api/auth/refresh", async (req, res) => {
  try {
    const secret = getAccessSecret();
    const rt = req.cookies?.refresh_token;

    if (!secret || !rt) {
      return authError(res, "REFRESH_MISSING");
    }

    const oldHash = hashToken(rt);

    const record = await prisma.refreshToken.findUnique({
      where: { tokenHash: oldHash },
    });

    if (!record) {
      clearRefreshCookie(res);
      return authError(res, "REFRESH_MISSING");
    }

    // ✅ Reuse detection：已被撤銷還拿來用
    if (record.revokedAt) {
      // 撤銷該 user 所有仍有效 refresh（安全底盤加分）
      await prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      clearRefreshCookie(res);
      return authError(res, "REFRESH_INVALID");
    }

    // 過期
    if (record.expiresAt < new Date()) {
      clearRefreshCookie(res);
      return authError(res, "REFRESH_INVALID");
    }

    // rotation：產新 refresh
    const newRefreshToken = generateRefreshToken();
    const newHash = hashToken(newRefreshToken);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { tokenHash: oldHash },
        data: { revokedAt: new Date(), replacedBy: newHash },
      }),
      prisma.refreshToken.create({
        data: {
          userId: record.userId,
          tokenHash: newHash,
          expiresAt: new Date(Date.now() + refreshTtlMs()),
        },
      }),
    ]);

    const newAccessToken = jwt.sign({ sub: record.userId }, secret, { expiresIn: accessTtl() });

    setRefreshCookie(res, newRefreshToken);
    res.json({ ok: true, accessToken: newAccessToken });
  } catch (e) {
    console.error(e);
    clearRefreshCookie(res);
    res.status(500).json({ ok: false, message: "SERVER_ERROR" });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const rt = req.cookies?.refresh_token;
    clearRefreshCookie(res);

    if (rt) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(rt), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    clearRefreshCookie(res);
    res.status(500).json({ ok: false, message: "SERVER_ERROR" });
  }
});

/* =======================
   Courses / Planner APIs
======================= */
app.get("/api/raw-courses", async (req, res) => {
  try {
    const items = await prisma.course.findMany({ take: 50 });
    res.json({ ok: true, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "SERVER_ERROR" });
  }
});

app.get("/api/planner", requireAuth, async (req, res) => {
  try {
    const items = await prisma.plannerItem.findMany({
      where: { userId: req.userId },
    });
    res.json({ ok: true, data: items });
  } catch (err) {
  console.error("[server.js:L317] ERROR =", err);
  console.error(err?.stack);
  return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
  

});

/* =======================
   Start / Shutdown
======================= */
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});
