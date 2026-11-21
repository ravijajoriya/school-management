-- Phase 4 · 011_attendance — one attendance outcome per student enrolment, date and session.

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_enrolment_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "session_code" VARCHAR(20) NOT NULL DEFAULT 'FULL_DAY',
    "status" VARCHAR(20) NOT NULL,
    "remarks" VARCHAR(255),
    "marked_by" UUID NOT NULL,
    "marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6),
    "correction_reason" TEXT,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_records_attendance_date_idx" ON "attendance_records"("attendance_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_enrolment_date_session_key" ON "attendance_records"("student_enrolment_id", "attendance_date", "session_code");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_enrolment_id_fkey" FOREIGN KEY ("student_enrolment_id") REFERENCES "student_enrolments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_status_chk"
    CHECK ("status" IN ('PRESENT', 'ABSENT', 'LATE'));

-- Only FULL_DAY is used for now; half-day sessions can be enabled later without a migration.
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_chk"
    CHECK ("session_code" IN ('FULL_DAY', 'MORNING', 'AFTERNOON'));

-- An update always records who made it and when.
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_updated_pair_chk"
    CHECK (("updated_by" IS NULL) = ("updated_at" IS NULL));
