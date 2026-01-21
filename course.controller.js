// course.controller.js
import prisma from "./prismaClient.js";

// 小工具：安全 parse int
function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickPaging(req) {
  const page = Math.max(1, toInt(req.query.page, 1));
  const pageSize = Math.min(100, Math.max(1, toInt(req.query.pageSize, 20)));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip, take: pageSize };
}

/**
 * COURSE-LIST: GET /api/courses?page=&pageSize=&include=sections
 * - include=sections：會把 sections + schedules 一起帶出（方便做課表畫面）
 */
export async function listCourses(req, res) {
  try {
    const { page, pageSize, skip, take } = pickPaging(req);
    const includeSections = String(req.query.include || "").toLowerCase() === "sections";

    const [total, items] = await Promise.all([
      prisma.course.count(),
      prisma.course.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: includeSections
          ? {
              id: true,
              name: true,
              teacher: true,
              credits: true,
              createdAt: true,
              sections: {
                select: {
                  id: true,
                  code: true,
                  quota: true,
                  schedules: { select: { id: true, day: true, start: true, end: true } },
                },
              },
            }
          : {
              id: true,
              name: true,
              teacher: true,
              credits: true,
              createdAt: true,
            },
      }),
    ]);

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items,
    });
  } catch (err) {
    console.error("[COURSE-LIST] ERROR =", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

/**
 * COURSE-SEARCH: GET /api/courses/search?q=xxx&page=&pageSize=&include=sections
 */
export async function searchCourses(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const { page, pageSize, skip, take } = pickPaging(req);
    const includeSections = String(req.query.include || "").toLowerCase() === "sections";

    if (!q) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "q is required" });
    }

    const where = {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { teacher: { contains: q, mode: "insensitive" } },
      ],
    };

    const [total, items] = await Promise.all([
      prisma.course.count({ where }),
      prisma.course.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: includeSections
          ? {
              id: true,
              name: true,
              teacher: true,
              credits: true,
              createdAt: true,
              sections: {
                select: {
                  id: true,
                  code: true,
                  quota: true,
                  schedules: { select: { id: true, day: true, start: true, end: true } },
                },
              },
            }
          : {
              id: true,
              name: true,
              teacher: true,
              credits: true,
              createdAt: true,
            },
      }),
    ]);

    return res.json({
      ok: true,
      q,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items,
    });
  } catch (err) {
    console.error("[COURSE-SEARCH] ERROR =", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

/**
 * COURSE-DETAIL: GET /api/courses/:id
 * 回傳：course + sections + schedules（就是你要的「WITH_SECTIONS」整合）
 */
export async function getCourseDetail(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "BAD_REQUEST", message: "id required" });

    const course = await prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        teacher: true,
        credits: true,
        createdAt: true,
        sections: {
          select: {
            id: true,
            code: true,
            quota: true,
            schedules: { select: { id: true, day: true, start: true, end: true } },
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ error: "NOT_FOUND", message: "course not found" });
    }

    return res.json({ ok: true, course });
  } catch (err) {
    console.error("[COURSE-DETAIL] ERROR =", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}

/**
 * GET /api/courses/:id/schedules
 * 把這門課底下所有 schedules 整平回傳（你原本就有這條，但這版比較統一）
 */
export async function getCourseSchedules(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "BAD_REQUEST", message: "id required" });

    // 直接查 schedule -> section -> courseId
    // ⚠️ 這裡假設 Section 有 courseId 欄位指向 Course.id
    const schedules = await prisma.schedule.findMany({
      where: { section: { courseId: id } },
      select: {
        id: true,
        day: true,
        start: true,
        end: true,
        section: { select: { id: true, code: true } },
      },
      orderBy: [{ day: "asc" }, { start: "asc" }],
    });

    return res.json({ ok: true, courseId: id, schedules });
  } catch (err) {
    console.error("[COURSE-SCHEDULES] ERROR =", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
