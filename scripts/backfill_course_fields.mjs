/**
 * 用 RawCourse 補齊 Course / Section 欄位
 * - 只補 NULL
 * - 不覆蓋已有值
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Start backfilling course fields...");

  // 1️⃣ 找出所有「有 rawCourseId」的 Section
  const sections = await prisma.section.findMany({
    where: {
      rawCourseId: { not: null },
    },
    include: {
      course: true,
    },
  });

  console.log(`🔎 Found ${sections.length} sections with rawCourseId`);

  let courseUpdated = 0;
  let sectionUpdated = 0;

  for (const sec of sections) {
    const raw = await prisma.rawCourse.findUnique({
      where: { id: sec.rawCourseId },
    });

    if (!raw) continue;

    // 2️⃣ 補 Course（只補目前是 null 的）
    const courseData = {};
    if (!sec.course.code && raw.code) {
      courseData.code = raw.code;
    }
    if (!sec.course.department && raw.department) {
      courseData.department = raw.department;
    }
    if (!sec.course.grade && raw.grade) {
      courseData.grade = raw.grade;
    }
    if (sec.course.required == null && raw.required != null) {
      courseData.required = raw.required;
    }

    if (Object.keys(courseData).length > 0) {
      await prisma.course.update({
        where: { id: sec.courseId },
        data: courseData,
      });
      courseUpdated++;
    }

    // 3️⃣ 補 Section（例如地點）
    if (!sec.location && raw.location) {
      await prisma.section.update({
        where: { id: sec.id },
        data: {
          location: raw.location,
        },
      });
      sectionUpdated++;
    }
  }

  console.log(`✅ Courses updated: ${courseUpdated}`);
  console.log(`✅ Sections updated: ${sectionUpdated}`);
  console.log("🎉 Backfill completed.");
}

main()
  .catch((e) => {
    console.error("❌ Backfill failed:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
