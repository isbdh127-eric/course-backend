// course.controller.js
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
const prisma = new PrismaClient();
const generalCourseCodes = JSON.parse(readFileSync(
  new URL("./data/general-course-codes-1141.json", import.meta.url), "utf8",
));
const generalCourseCodeSet = new Set(generalCourseCodes);

function classifyCourse(course) {
  return generalCourseCodeSet.has(course.code) ? { ...course, type: "general" } : course;
}

/**
 * 共用：dept 條件
 * 例：dept=22140,33140 → 用前三碼 221 / 331 比對
 */
function buildDeptWhere(req) {
  const deptRaw = String(req.query.dept || "").trim();
  const deptList = deptRaw
    ? deptRaw.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  const where = {};
  if (req.query.type === "general") {
    where.code = { in: generalCourseCodes };
    return { where, deptRaw, deptList };
  }
  if (deptList.length > 0) {
    where.OR = deptList.map(code => ({
      department: { startsWith: String(code).slice(0, 3) },
    }));
  }

  return { where, deptRaw, deptList };
}

/**
 * GET /api/courses
 */
export async function listCourses(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 50)));

    const { where, deptRaw, deptList } = buildDeptWhere(req);

    console.log("[listCourses]", { page, pageSize, deptRaw, deptList });

    const [total, items] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          sections: { include: { schedules: true } },
        },
      }),
    ]);

    res.json({
      ok: true,
      __apiVersion: "listCourses_2026-02-21",
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: items.map(classifyCourse),
    });
  } catch (e) {
    console.error("[listCourses] ERROR", e);
    res.status(500).json({ ok: false, message: e?.message || "SERVER_ERROR" });
  }
}

/**
 * GET /api/courses/search
 */
export async function searchCourses(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 50)));

    const { where: deptWhere, deptRaw, deptList } = buildDeptWhere(req);

    const textWhere = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { teacher: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const where = { ...deptWhere };
    if (q) {
      if (where.OR) {
        where.AND = [{ OR: where.OR }, textWhere];
        delete where.OR;
      } else {
        Object.assign(where, textWhere);
      }
    }

    console.log("[searchCourses]", { q, page, pageSize, deptRaw, deptList });

    const [total, items] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          sections: { include: { schedules: true } },
        },
      }),
    ]);

    res.json({
      ok: true,
      __apiVersion: "searchCourses_2026-02-21",
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: items.map(classifyCourse),
    });
  } catch (e) {
    console.error("[searchCourses] ERROR", e);
    res.status(500).json({ ok: false, message: e?.message || "SERVER_ERROR" });
  }
}

/**
 * GET /api/courses/:id
 */
export async function getCourseDetail(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, message: "MISSING_ID" });
    }

    const item = await prisma.course.findUnique({
      where: { id },
      include: {
        sections: { include: { schedules: true } },
      },
    });

    if (!item) {
      return res.status(404).json({ ok: false, message: "NOT_FOUND" });
    }

    res.json({ ok: true, item });
  } catch (e) {
    console.error("[getCourseDetail] ERROR", e);
    res.status(500).json({ ok: false, message: e?.message || "SERVER_ERROR" });
  }
}
/**
 * GET /api/courses/:id/schedules
 * 只回傳課程的 sections + schedules（給前端表格 / 時段用）
 */
export async function getCourseSchedules(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({
        ok: false,
        message: "MISSING_ID",
      });
    }

    const course = await prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        sections: {
          select: {
            id: true,
            teacher: true,
            schedules: {
              orderBy: [{ day: "asc" }, { start: "asc" }],
            },
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({
        ok: false,
        message: "NOT_FOUND",
      });
    }

    res.json({
      ok: true,
      courseId: course.id,
      name: course.name,
      code: course.code,
      sections: course.sections,
    });
  } catch (e) {
    console.error("[getCourseSchedules] ERROR =", e);
    res.status(500).json({
      ok: false,
      message: e?.message || "SERVER_ERROR",
    });
  }
}
