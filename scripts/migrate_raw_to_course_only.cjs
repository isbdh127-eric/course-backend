const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  console.log("[MIGRATE] start rawCourse -> course");

  const raws = await prisma.rawCourse.findMany();
  console.log("[MIGRATE] rawCourse count =", raws.length);

  if (raws.length === 0) {
    console.log("[MIGRATE] no rawCourse, abort");
    return;
  }

  let created = 0;

  for (const r of raws) {
    // 用 subjectCode + semester 當唯一（最保守）
    await prisma.course.upsert({
      where: {
        subjectCode_semester: {
          subjectCode: r.subjectCode,
          semester: r.semester,
        },
      },
      update: {},
      create: {
        semester: r.semester,
        subjectCode: r.subjectCode,
        name: r.name,
        teacher: r.teacher,
        credits: r.credits,
      },
    });
    created++;
  }

  console.log("[MIGRATE] course created/ensured =", created);
}

module.exports = { run };
