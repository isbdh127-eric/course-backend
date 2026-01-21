-- CreateTable
CREATE TABLE "public"."RawCourse" (
    "id" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "subjectCode" TEXT NOT NULL,
    "classGroup" TEXT,
    "dayOfWeek" INTEGER,
    "periods" TEXT,
    "location" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawCourse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RawCourse_semester_subjectCode_classGroup_dayOfWeek_periods_key" ON "public"."RawCourse"("semester", "subjectCode", "classGroup", "dayOfWeek", "periods", "location");
