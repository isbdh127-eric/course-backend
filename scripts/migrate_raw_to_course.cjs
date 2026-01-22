const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  console.log("[MIGRATE] RawCourse -> Course");

  // 1. 先把 rawCourse 撈出來
  const raws = await prisma.rawCourse.findMany();
  console.log("[MIGRATE] rawCourse count =", raws.length);

  if (raws.length === 0) {
    console.log("[MIGRATE] no rawCourse, abort");
    return;
  }

  // 2. 用 subjectCode 當作課程代碼（對應 Course.code）
  const map = new Map();

  for (const r of raws) {
    // 同一 subjectCode 視為同一門課
    if (!map.has(r.subjectCode)) {
      map.set(r.subjectCode, {
        code: r.subjectCode,
        name: r.raw?.name || r.subjectCode,
        teacher: r.raw?.teacher || "未知",
        credits: Number(r.raw?.credits || 0),
      });
    }
  }

  let created = 0;

  for (const c of map.values()) {
    await prisma.course.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        name: c.name,
        teacher: c.teacher,
        credits: c.credits,
      },
    });
    created++;
  }

  console.log("[MIGRATE] course ensured =", created);
}

module.exports = { run };
