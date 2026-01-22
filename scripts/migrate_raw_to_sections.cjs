// scripts/migrate_raw_to_sections.cjs
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// "1,2,3" -> [1,2,3]
function parsePeriods(periods) {
  if (!periods) return [];
  return String(periods)
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

// 把節次陣列切成「連續區間」
// [1,2,3,5,6] -> [[1,3],[5,6]]
function toRanges(nums) {
  if (nums.length === 0) return [];
  const ranges = [];
  let s = nums[0];
  let prev = nums[0];

  for (let i = 1; i < nums.length; i++) {
    const cur = nums[i];
    if (cur === prev + 1) {
      prev = cur;
    } else {
      ranges.push([s, prev]);
      s = cur;
      prev = cur;
    }
  }
  ranges.push([s, prev]);
  return ranges;
}

// ✅ 重要：Schedule 的 start/end 我們用「半開區間」表示：
// 例如 periods 1,2 -> range [1,2] -> start=1, end=3
// 這樣你的 overlap 判斷：newStart < oldEnd && newEnd > oldStart 就會正確
function rangeToSchedule(startPeriod, endPeriodInclusive) {
  return { start: startPeriod, end: endPeriodInclusive + 1 };
}

function toIntOrNull(x) {
  const n = parseInt(String(x ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const total = await prisma.rawCourse.count();
  console.log("RawCourse total =", total);

  const pageSize = 200;
  for (let skip = 0; skip < total; skip += pageSize) {
    const raws = await prisma.rawCourse.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        semester: true,
        subjectCode: true,
        classGroup: true,
        dayOfWeek: true,
        periods: true,
        raw: true,
      },
    });

    for (const rc of raws) {
      // 已轉過就跳過
      const exists = await prisma.section.findUnique({
        where: { rawCourseId: rc.id },
        select: { id: true },
      });
      if (exists) continue;

      const raw = rc.raw || {};
      const name = raw["科目中文名稱"] || rc.subjectCode;
      const teacher = raw["授課教師姓名"] || null;
      const credits = toIntOrNull(raw["學分數"]);

      // 1) 建/更新 Course（用 rawCourse.id 當 course.id，兩者都是 cuid，最穩）
      // 注意：如果你的 Course model 有必填欄位（非 null），要在 create 補齊
      await prisma.course.upsert({
        where: { id: rc.id },
        update: {
          name,
          teacher,
          credits,
        },
        create: {
          id: rc.id,
          name,
          teacher,
          credits,
        },
      });
        const quota =
        Number.isFinite(parseInt(raw["上課人數"], 10))
            ? parseInt(raw["上課人數"], 10)
            : 0;

      // 2) 建 Section（1筆 RawCourse -> 1筆 Section）
      const section = await prisma.section.create({
        data: {
        courseId: rc.id,
        rawCourseId: rc.id,
        code: `${rc.subjectCode}${rc.classGroup}`,
         quota, 
            },
        select: { id: true },

        });


      // 3) 建 Schedule（用 dayOfWeek + periods）
      const day = rc.dayOfWeek; // 你 rawCourse 是 number
      const nums = parsePeriods(rc.periods);
      const ranges = toRanges(nums);

      for (const [sp, ep] of ranges) {
        const { start, end } = rangeToSchedule(sp, ep);
        await prisma.schedule.create({
          data: {
            sectionId: section.id,
            day,
            start,
            end,
          },
        });
      }
    }

    console.log("processed", Math.min(skip + pageSize, total), "/", total);
  }

  console.log("DONE: migrated RawCourse -> Course/Section/Schedule");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
module.exports = { runMigrate: main };


