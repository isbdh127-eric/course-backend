import prisma from "./prismaClient.js";


// 如果你 prismaClient.js 是 export default prisma，就改成：
// import prisma from "./prismaClient.js";

function dayToText(day) {
  const map = {
    1: "週一",
    2: "週二",
    3: "週三",
    4: "週四",
    5: "週五",
    6: "週六",
    7: "週日",
  };
  return map[day] || `週${day}`;
}

function toMinute(t) {
  if (t === null || t === undefined) return null;
  if (typeof t === "number") return t;

  const s = String(t).trim();

  // "0910"
  if (/^\d{4}$/.test(s)) {
    const h = Number(s.slice(0, 2));
    const m = Number(s.slice(2, 4));
    return h * 60 + m;
  }

  // "09:10"
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);

  return null;
}

function isOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}


// POST /api/planner
export async function addPlannerItem(req, res) {
  try {
    // ===== 基本檢查 =====
    const userId = req.header("x-user-id");
    const { courseId } = req.body || {};

    console.log("ADD PLANNER HIT:", { userId, courseId });

    if (!userId) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "缺少 x-user-id",
      });
    }

    if (!courseId || typeof courseId !== "string") {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "courseId required",
      });
    }

    // ===== Step A：重複加入檢查 =====
    const existed = await prisma.planner.findFirst({
      where: { userId, courseId },
      select: { id: true },
    });

    if (existed) {
      return res.status(409).json({
        error: "DUPLICATE",
        message: "你已經加入過這門課",
      });
    }

    // ===== Step B：取得新課程 schedules =====
    const newSchedules = await prisma.schedule.findMany({
      where: { section: { courseId } },
      select: {
        day: true,
        start: true,
        end: true,
        section: {
          select: {
            id: true,
            code: true,
            courseId: true,
          },
        },
      },
    });

    // ===== 使用者已選課程 =====
    const userPlanners = await prisma.planner.findMany({
      where: { userId },
      select: { courseId: true },
    });

    const existingCourseIds = userPlanners.map((p) => p.courseId);

    // ===== Step C：衝堂檢查 =====
    if (existingCourseIds.length > 0 && newSchedules.length > 0) {
      const oldSchedules = await prisma.schedule.findMany({
        where: { section: { courseId: { in: existingCourseIds } } },
        select: {
          day: true,
          start: true,
          end: true,
          section: {
            select: {
              id: true,
              code: true,
              courseId: true,
            },
          },
        },
      });

      const conflicts = [];

      for (const ns of newSchedules) {
        const nStart = toMinute(ns.start);
        const nEnd = toMinute(ns.end);
        if (nStart === null || nEnd === null) continue;

        for (const os of oldSchedules) {
          if (os.day !== ns.day) continue;

          const oStart = toMinute(os.start);
          const oEnd = toMinute(os.end);
          if (oStart === null || oEnd === null) continue;

          if (isOverlap(nStart, nEnd, oStart, oEnd)) {
            const overlapStart = Math.max(nStart, oStart);
            const overlapEnd = Math.min(nEnd, oEnd);

            conflicts.push({
              day: ns.day,
              new: { start: ns.start, end: ns.end },
              old: { start: os.start, end: os.end },
              overlap: {
                startMin: overlapStart,
                endMin: overlapEnd,
                minutes: overlapEnd - overlapStart,
              },
              oldRef: {
                courseId: os.section.courseId,
                sectionId: os.section.id,
                sectionCode: os.section.code,
              },
            });
          }
        }
      }

      // ✅ 有衝突：在這裡查課名 + 組 message + 回傳
if (conflicts.length > 0) {
  const c0 = conflicts[0];

  // 1) 查課名（人話 message 用）
  const [targetCourse, oldCourse] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true, teacher: true },
    }),
    prisma.course.findUnique({
      where: { id: c0.oldRef.courseId },
      select: { name: true, teacher: true },
    }),
  ]);

  // 2) 取得同一門課所有班別 + 時間（候選方案）
  const allSections = await prisma.section.findMany({
    where: { courseId },
    select: {
      id: true,
      code: true,
      schedules: { select: { day: true, start: true, end: true } },
    },
    orderBy: { code: "asc" },
  });

  // 3) 判斷某個 section 是否與既有課表衝堂（用 oldSchedules）
  function sectionHasConflict(sec) {
    for (const ns of sec.schedules) {
      const nStart = toMinute(ns.start);
      const nEnd = toMinute(ns.end);
      if (nStart === null || nEnd === null) continue;

      for (const os of oldSchedules) {
        if (os.day !== ns.day) continue;

        const oStart = toMinute(os.start);
        const oEnd = toMinute(os.end);
        if (oStart === null || oEnd === null) continue;

        if (isOverlap(nStart, nEnd, oStart, oEnd)) return true;
      }
    }
    return false;
  }

  // 4) 只回傳「不衝堂」的班別
const suggestedSections = [];

for (const sec of allSections) {
  const has = sectionHasConflict(sec);
  console.log("[SUGGEST]", sec.code, sec.id, "hasConflict =", has, "schedules =", sec.schedules);

  if (!has) {
    suggestedSections.push({
      sectionId: sec.id,
      code: sec.code,
      schedules: sec.schedules
        .slice()
        .sort((a, b) => (a.day - b.day) || (toMinute(a.start) - toMinute(b.start)))
        .map((s) => ({
          day: s.day,
          dayText: dayToText(s.day),
          start: s.start,
          end: s.end,
        })),
    });
  }
}


  // 5) 人話 message（節次版本）
  const dayText = dayToText(c0.day);
  const periodText = `第 ${c0.overlap.startMin} 節`;
  const message =
    `${dayText}${periodText}衝堂：` +
    `你選的「${targetCourse?.name ?? "此課程"}」` +
    `與「${oldCourse?.name ?? "已選課程"}」重疊`;

return res.status(409).json({
  ok: false,
  code: "TIME_CONFLICT",
  message,
  data: {
    target: {
      courseId,
      courseName: targetCourse?.name ?? null,
      teacher: targetCourse?.teacher ?? null,
    },
    conflicts,
    suggestions: {
      count: suggestedSections.length,
      sections: suggestedSections,
      reason: suggestedSections.length === 0 ? "此課程沒有任何不衝堂班別" : null,
    },
    debug: {
      totalSections: allSections.length,
      sectionCodes: allSections.map(s => s.code),
    },
    meta: {
      suggestionUnit: "section",
      note: "目前 API 仍以 courseId 加入；suggestions 只提供前端提示用",
    },
    },
  });
}


    }

    // ===== Step D：建立 planner =====
    const created = await prisma.planner.create({
      data: { userId, courseId },
      select: {
        id: true,
        userId: true,
        courseId: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      ok: true,
      item: created,
    });
  } catch (err) {
    console.error("addPlannerItem ERROR =", err);
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "伺服器錯誤",
    });
  }
}
