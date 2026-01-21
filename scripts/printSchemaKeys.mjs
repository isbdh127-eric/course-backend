import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const run = async () => {
  const section = await p.section.findFirst();
  const schedule = await p.schedule.findFirst();
  const course = await p.course.findFirst();

  console.log("Course keys =", Object.keys(course || {}));
  console.log("Section keys =", Object.keys(section || {}));
  console.log("Schedule keys =", Object.keys(schedule || {}));

  await p.$disconnect();
};

run();
