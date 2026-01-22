import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const r = await prisma.rawCourse.findFirst({
    select: { subjectCode: true, raw: true, location: true, periods: true, dayOfWeek: true },
  });

  console.log("subjectCode =", r?.subjectCode);
  console.log("dayOfWeek   =", r?.dayOfWeek);
  console.log("periods    =", r?.periods);
  console.log("location   =", r?.location);
  console.log("raw        =", r?.raw);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
