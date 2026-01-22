-- DropForeignKey
ALTER TABLE "public"."PlannerItem" DROP CONSTRAINT "PlannerItem_sectionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PlannerItem" DROP CONSTRAINT "PlannerItem_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Schedule" DROP CONSTRAINT "Schedule_sectionId_fkey";

-- DropIndex
DROP INDEX "public"."Section_rawCourseId_key";

-- AlterTable
ALTER TABLE "public"."Course" ADD COLUMN     "code" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "grade" INTEGER,
ADD COLUMN     "required" BOOLEAN;

-- AlterTable
ALTER TABLE "public"."Section" ADD COLUMN     "location" TEXT,
ALTER COLUMN "rawCourseId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "PlannerItem_userId_idx" ON "public"."PlannerItem"("userId");

-- CreateIndex
CREATE INDEX "PlannerItem_sectionId_idx" ON "public"."PlannerItem"("sectionId");

-- AddForeignKey
ALTER TABLE "public"."Schedule" ADD CONSTRAINT "Schedule_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "public"."Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlannerItem" ADD CONSTRAINT "PlannerItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlannerItem" ADD CONSTRAINT "PlannerItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "public"."Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
