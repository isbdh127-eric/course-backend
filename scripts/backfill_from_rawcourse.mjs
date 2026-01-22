import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function tryParseJSON(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (!(s.startsWith("{") || s.startsWith("["))) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// 嘗試從 raw（可能是 JSON / 文字）解析 department/grade/required
function extractExtras(rawValue) {
  const out = { department: null, grade: null, required: null };

  // rawValue 很可能是「字串長得像 JS 物件」或真正 JSON 字串
  // 你貼的格式看起來像 console 印出的 object，所以我們用最通用做法：
  // 1) 如果是 object 直接用
  // 2) 如果是字串，嘗試 JSON.parse；不行就用關鍵字 regex 抓

  let obj = null;

  if (rawValue && typeof rawValue === "object") obj = rawValue;
  if (!obj && typeof rawValue === "string") {
    // 先嘗試 JSON
    const s = rawValue.trim();
    if (s.startsWith("{") || s.startsWith("[")) {
      try { obj = JSON.parse(s); } catch {}
    }
  }

  // ✅ 情況 A：raw 是物件（最理想）
  if (obj && typeof obj === "object") {
    const dept = obj["課別名稱"] ?? obj["系所名稱"] ?? obj["開課系所"] ?? obj["系所代碼"] ?? null;
    const grade = obj["年級"] ?? obj["適用年級"] ?? null;
    const typeName = obj["課別名稱"] ?? null;
    const typeCode = obj["課別代碼"] ?? null;

    if (typeof dept === "string" && dept.trim()) out.department = dept.trim();

    if (grade != null) {
      const m = String(grade).match(/\d+/);
      if (m) out.grade = Number(m[0]);
    }

    // required：優先看課別名稱文字，其次看課別代碼
    if (typeName != null) {
      const s = String(typeName);
      if (s.includes("必修")) out.required = true;
      else if (s.includes("選修")) out.required = false;
    }
    if (out.required == null && typeCode != null) {
      const c = String(typeCode).trim();
      if (c === "1") out.required = true;
      // 如果你日後發現代碼規則不同，再補 mapping
    }

    return out;
  }

  // ✅ 情況 B：raw 是字串（用 regex 抓）
  const text = rawValue == null ? "" : String(rawValue);

  // grade
  const gm = text.match(/'年級'\s*:\s*'?(?<g>\d+)'?/);
  if (gm?.groups?.g) out.grade = Number(gm.groups.g);

  // department（課別名稱）
  const dm = text.match(/'課別名稱'\s*:\s*'(?<d>[^']+)'/);
  if (dm?.groups?.d) out.department = dm.groups.d.trim();

  // required
  if (text.includes("必修")) out.required = true;
  else if (text.includes("選修")) out.required = false;
  else {
    const cm = text.match(/'課別代碼'\s*:\s*'?(?<c>\d+)'?/);
    if (cm?.groups?.c && cm.groups.c.trim() === "1") out.required = true;
  }

  return out;
}


async function main() {
  console.log("🚀 Backfill from RawCourse via Section.rawCourseId");

  // 取出所有有 rawCourseId 的 section（你之前提示有 633 筆）
  const sections = await prisma.section.findMany({
    where: { rawCourseId: { not: null } },
    select: {
      id: true,
      code: true,
      courseId: true,
      location: true,
      rawCourseId: true,
      course: {
        select: {
          id: true,
          code: true,
          required: true,
          department: true,
          grade: true,
        },
      },
    },
  });

  console.log(`🔎 sections with rawCourseId: ${sections.length}`);

  let courseUpdated = 0;
  let sectionUpdated = 0;
  let extrasUpdated = 0;
  let missingRaw = 0;

  for (const sec of sections) {
    const raw = await prisma.rawCourse.findUnique({
      where: { id: sec.rawCourseId },
      select: {
        id: true,
        subjectCode: true,
        location: true,
        raw: true,
      },
    });

    if (!raw) {
      missingRaw++;
      continue;
    }

    // 1) 回填 Course.code（最重要：你現在 courseCode 全是 null）
    if (!sec.course.code && raw.subjectCode) {
      await prisma.course.update({
        where: { id: sec.courseId },
        data: { code: String(raw.subjectCode).trim() },
      });
      courseUpdated++;
    }

    // 2) 回填 Section.location（如果你資料有缺）
    if (!sec.location && raw.location) {
      await prisma.section.update({
        where: { id: sec.id },
        data: { location: String(raw.location).trim() },
      });
      sectionUpdated++;
    }

    // 3) 嘗試從 raw.raw 解析 department/grade/required（若 raw 裡真的有）
    const extras = extractExtras(raw.raw);

    const data = {};
 if (sec.course.department == null && extras.department) {
  data.department = String(extras.department).trim();
}

    if (sec.course.grade == null && extras.grade != null) data.grade = extras.grade;
    if (sec.course.required == null && extras.required != null) data.required = extras.required;

    if (Object.keys(data).length > 0) {
      await prisma.course.update({
        where: { id: sec.courseId },
        data,
      });
      extrasUpdated++;
    }
  }

  console.log("✅ Done");
  console.log("Course.code updated:", courseUpdated);
  console.log("Section.location updated:", sectionUpdated);
  console.log("Course extras updated:", extrasUpdated);
  console.log("Missing rawCourse rows:", missingRaw);
}

main()
  .catch((e) => {
    console.error("❌ Backfill failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
