import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Backfill Course.code from Section.code (first section per course)");

  // 找所有還沒有 code 的 course
  const courses = await prisma.course.findMany({
    where: { code: null },
    select: { id: true },
  });

  console.log(`🔎 Courses with code=null: ${courses.length}`);

  let updated = 0;

  for (const c of courses) {
    // 找這門課底下任意一個 section（拿它的 code 來當 course.code）
    const sec = await prisma.section.findFirst({
      where: { courseId: c.id },
      orderBy: { createdAt: "asc" },
      select: { code: true },
    });

    if (!sec?.code) continue;

    await prisma.course.update({
      where: { id: c.id },
      data: { code: sec.code },
    });

    updated++;
    if (updated % 50 === 0) console.log(`...updated ${updated}`);
  }

  console.log(`✅ Done. Updated courses: ${updated}`);
}

main()
  .catch((e) => {
    console.error("❌ Backfill failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
