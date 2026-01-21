const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();

(async () => {
  const x = await p.rawCourse.findFirst();
  console.log("RawCourse keys =", Object.keys(x || {}));
  console.log("sample =", x);
  await p.$disconnect();
})();
