const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  console.log(Object.keys(p).filter(k => !k.startsWith("$") && !k.startsWith("_")));
  await p.$disconnect();
}

main();
