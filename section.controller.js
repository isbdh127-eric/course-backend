// section.controller.js
import prisma from "./prismaClient.js";
import { fileURLToPath } from "url";

console.log("SECTION CONTROLLER LOADED:", fileURLToPath(import.meta.url));



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

// 你專案目前有時候用 req.user，有時候用 x-user-id
function getUserId(req) {
  const fromUser = req.user?.id;
  const fromHeader = req.headers["x-user-id"];
  const uid = fromUser || fromHeader;
  return uid ? String(uid) : null;
}

// 判斷兩個 schedule 是否衝堂（同一天且時間區間重疊）
function isTimeConflict(a, b) {
  if (a.day !== b.day) return false;
  // 重疊條件：不是完全在左邊、也不是完全在右邊
  return !(a.end < b.start || a.start > b.end);
}

/**
 * SECTION-CARDS: GET /api/sections/cards?page=&pageSize=&q=
 * - 回傳「前端課程卡」：一張卡 = 一個 Section
 * - q 可選：用課名/老師搜尋（跟你 course.search 一樣概念，但回傳 section cards）
 * - 若有登入：會算 isSelected / isConflict / canAdd
 */
export async function listSectionCards(req, res) {
  try {
    const userId = getUserId(req);
    const q = String(req.query.q || "").trim();
    const { page, pageSize, skip, take } = pickPaging(req);

    // 1) 先抓登入者已選的 sections（用來判斷 isSelected / isConflict）
    let selected = [];
    if (userId) {
      selected = await prisma.plannerItem.findMany({
        where: { userId },
        select: {
          sectionId: true,
          section: {
            select: {
              id: true,
              course: { select: { name: true } },
              schedules: { select: { day: true, start: true, end: true } },
            },
          },
        },
      });
    }

    // 2) 查詢 sections（可選 q）
    const where = q
      ? {
          course: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { teacher: { contains: q, mode: "insensitive" } },
            ],
          },
        }
      : undefined;

    const [total, rows] = await Promise.all([
      prisma.section.count({ where }),
      prisma.section.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
  id: true,
  code: true,
  quota: true,
  location: true,
  createdAt: true,

  course: {
    select: {
      id: true,
      code: true,
      name: true,
      teacher: true,
      credits: true,
      required: true,
      department: true,
      grade: true,
    },
  },

  schedules: { select: { day: true, start: true, end: true } },
  _count: { select: { plannerItems: true } },
},


        
      }),
    ]);

    // 3) 組成前端課程卡（CourseCard）
   // 3) 組成前端課程卡（CourseCard）
const items = rows.map((sec) => {
    const rawDept = sec.course.department;
const cleanDept = String(rawDept ?? "").replace(/\s+/g, " ").trim();

if (sec.id === rows[0].id) {
  console.log("RAW dept =", JSON.stringify(rawDept));
  console.log("CLEAN dept =", JSON.stringify(cleanDept));
}

  const requiredText =
    sec.course.required === true ? "必修" :
    sec.course.required === false ? "選修" :
    "未知";

  // ✅ 關鍵：把所有空白/換行壓成單一空白，再 trim
  const departmentClean = String(sec.course.department ?? "")
    .replace(/\s+/g, " ")
    .trim();

  const departmentText = departmentClean || "未知";

  const enrolled = sec._count.plannerItems;
  const remaining = sec.quota - enrolled;

  const isSelected = userId
    ? selected.some((x) => x.sectionId === sec.id)
    : false;

  let isConflict = false;
  const conflictWithSet = new Set();

  if (userId && !isSelected) {
    for (const picked of selected) {
      const pickedName = picked.section?.course?.name || "(unknown)";
      const pickedSchedules = picked.section?.schedules || [];

      for (const s1 of sec.schedules) {
        for (const s2 of pickedSchedules) {
          if (isTimeConflict(s1, s2)) {
            isConflict = true;
            conflictWithSet.add(pickedName);
          }
        }
      }
    }
  }

  const conflictWith = Array.from(conflictWithSet);

  return {
    courseId: sec.course.id,
    sectionId: sec.id,
    courseCode: sec.course.code ?? null,
    sectionCode: sec.code,

    name: sec.course.name,
    credits: sec.course.credits,
    teacher: sec.course.teacher,

    required: sec.course.required ?? null,
    requiredText,

    // ✅ 這兩個一定乾淨
department: cleanDept || null,
departmentText: cleanDept || "未知",



    grade: sec.course.grade ?? null,

    schedules: sec.schedules,
    location: sec.location ?? null,

    quota: sec.quota,
    enrolled,
    remaining,

    isSelected,
    isConflict,
    conflictWith,
    canAdd: !isSelected && !isConflict && remaining > 0,
  };
});



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
  console.error("[SECTION-CARDS] ERROR =", err);
  return res.status(500).json({
    error: "INTERNAL_ERROR",
    message: String(err?.message || err),
  });
}
}