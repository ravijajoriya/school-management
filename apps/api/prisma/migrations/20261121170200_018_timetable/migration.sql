-- Phase 6 · 018_timetable — class timetables and their periods.

-- CreateTable
CREATE TABLE "timetables" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE,
    "effective_to" DATE,
    "created_by" UUID NOT NULL,

    CONSTRAINT "timetables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "timetable_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "period_number" SMALLINT NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "class_subject_id" UUID,
    "teacher_employee_id" UUID,
    "room_label" VARCHAR(50),
    "is_break" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetables_section_id_status_idx" ON "timetables"("section_id", "status");

-- CreateIndex
CREATE INDEX "timetable_entries_teacher_employee_id_day_of_week_idx" ON "timetable_entries"("teacher_employee_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_timetable_id_day_of_week_period_number_key" ON "timetable_entries"("timetable_id", "day_of_week", "period_number");

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_section_id_academic_year_id_fkey" FOREIGN KEY ("section_id", "academic_year_id") REFERENCES "sections"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_timetable_id_fkey" FOREIGN KEY ("timetable_id") REFERENCES "timetables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "class_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_teacher_employee_id_fkey" FOREIGN KEY ("teacher_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "timetables" ADD CONSTRAINT "timetables_status_chk"
    CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_dates_chk"
    CHECK ("effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" >= "effective_from");
-- A section has at most one published timetable; publishing a new one archives the old one.
CREATE UNIQUE INDEX "timetables_one_published_idx" ON "timetables" ("section_id") WHERE "status" = 'PUBLISHED';

ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_day_chk" CHECK ("day_of_week" BETWEEN 1 AND 7);
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_period_chk" CHECK ("period_number" >= 0);
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_time_chk" CHECK ("end_time" > "start_time");
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_break_chk"
    CHECK (NOT "is_break" OR ("class_subject_id" IS NULL AND "teacher_employee_id" IS NULL));
