/*
  Warnings:

  - A unique constraint covering the columns `[rawCourseId]` on the table `Section` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `rawCourseId` to the `Section` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Section" ADD COLUMN     "rawCourseId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Section_rawCourseId_key" ON "public"."Section"("rawCourseId");
