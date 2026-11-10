//console.log("BOOT:", __filename, new Date().toISOString());
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
import sectionRoutes from "./section.routes.js";

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3000);


const allowedOrigins = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:3000",
  "https://course-backend-api-pfyj.onrender.com",
];

app.use(cors({
  origin: function(origin, callback) {
    // 允許沒有 origin 的請求（像 curl / Postman）
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS blocked: " + origin), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-user-id"],
}));

// ✅ 確保 preflight 會回應
app.options(/.*/, cors());



// 觸發雲端轉換：rawCourse -> course/section/schedule
app.get("/__version", (req, res) => {
  res.send("backend-version: 2026-01-22-debugdb-A");
});
app.get("/api/admin/debug-db", requireImportSecret, (req, res) => {
  try {
    const url = process.env.DATABASE_URL || "";
    // 只回傳 host / db，不回傳帳密
    const m = url.match(/@([^:/]+).*\/([^?]+)/);
    const host = m?.[1] || null;
    const db = m?.[2] || null;

    res.json({ ok: true, host, db });
  } catch (e) {
    res.status(500).json({ ok: false, message: e?.message || String(e) });
  }
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
    credentials: true,
  })
);
/* =======================
   Middlewares
======================= */
app.use(express.json());
app.use(cookieParser());
app.use("/api/courses", courseRoutes);
app.use("/api/sections", sectionRoutes);


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
// ===== DEBUG APIs（只用來檢查 DB 狀態） =====
app.get("/api/admin/debug-counts", async (req, res) => {
  try {
    const raw = await prisma.rawCourse.count();
    const course = await prisma.course.count();
    const section = await prisma.section.count();
    const schedule = await prisma.schedule.count();

    res.json({
      ok: true,
      raw,
      course,
      section,
      schedule,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.get("/api/admin/debug-counts", requireImportSecret, async (req, res) => {
  try {
    const raw = await prisma.rawCourse.count();
    const course = await prisma.course.count();
    const section = await prisma.section.count();
    const schedule = await prisma.schedule.count();
    res.json({ ok: true, raw, course, section, schedule });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: e?.message || String(e) });
  }
});

app.get("/api/admin/debug-sample-raw", async (req, res) => {
  try {
    const one = await prisma.rawCourse.findFirst({
      orderBy: { createdAt: "desc" },
    });
    res.json({ ok: true, one });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: e.message });
  }
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

const { run: migrateCourse } = require("./scripts/migrate_raw_to_course.cjs");

app.post("/api/admin/migrate-course", requireImportSecret, async (req, res) => {
  try {
    await migrateCourse();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      ok: false,
      message: "MIGRATE_COURSE_FAILED",
      detail: e?.message,
    });
  }
});

const { runMigrate } = require("./scripts/migrate_raw_to_sections.cjs");

app.post("/api/admin/migrate", requireImportSecret, async (req, res) => {
  try {
  //  await runMigrate();
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

app.post("/api/planner", (req, res, next) => {
  if (req.body?.courses !== undefined) return requireAuth(req, res, next);
  next();
});
app.use("/api/planner", plannerRoutes);
/* =======================
   Health
======================= */
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));
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
app.get("/api/courses", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 50)));

    const deptRaw = String(req.query.dept || "").trim();
    const deptList = deptRaw
      ? deptRaw.split(",").map(s => s.trim()).filter(Boolean)
      : [];

    // ✅ 你 DB course.department 看起來是 "11330" 這種
    // dept=22140 → 用前3碼 "221" 去篩 (抓 22140 / 22160 ...)
    const where = {};
    if (deptList.length > 0) {
      where.OR = deptList.map(code => ({
        department: { startsWith: String(code).slice(0, 3) },
      }));
    }

    // ✅ DEBUG：你一定要看到這幾行，才表示你改到「正在跑的後端」
    console.log("[/api/courses] deptRaw =", deptRaw);
    console.log("[/api/courses] deptList =", deptList);
    console.log("[/api/courses] where =", JSON.stringify(where));

    const [total, items] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { sections: { include: { schedules: true } } },
      }),
    ]);

    res.json({
      ok: true,
      __apiVersion: "FORCE_TEST_2026-02-21-DEPT-STARTSWITH",
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: e?.message || "SERVER_ERROR" });
  }
});
app.get("/api/admin/debug-counts", requireImportSecret, async (req, res) => {
  try {
    const raw = await prisma.rawCourse.count();
    const course = await prisma.course.count();
    const section = await prisma.section.count();
    const schedule = await prisma.schedule.count();
    res.json({ ok: true, raw, course, section, schedule });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: e?.message || String(e) });
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
    const where = { userId: req.userId };
    const [items, saved] = await Promise.all([
      prisma.plannerItem.findMany({ where }),
      prisma.planner.findMany({
        where,
        select: { courseId: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    ]);
    const courses = saved.length ? await prisma.course.findMany({
      where: { id: { in: saved.map((item) => item.courseId) } },
      include: { sections: { include: { schedules: true } } },
    }) : [];
    const coursesById = new Map(courses.map((course) => [course.id, course]));
    res.json({
      ok: true,
      data: items,
      courses: saved.map((item) => coursesById.get(item.courseId)).filter(Boolean),
    });
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
