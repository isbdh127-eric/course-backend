import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const list = await prisma.rawCourse.findMany({
  where: {
    dayOfWeek: 4,
    periods: { contains: '2' }
  },
  select: {
    id: true,
    dayOfWeek: true,
    periods: true
  },
  take: 10
});

console.log(list);

await prisma.$disconnect();
