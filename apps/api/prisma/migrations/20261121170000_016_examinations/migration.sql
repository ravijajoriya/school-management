-- Phase 6 · 016_examinations — examinations, exam subjects and marks.

-- CreateTable
CREATE TABLE "examinations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "exam_type" VARCHAR(40) NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "grading_scale_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "examinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_subjects" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "examination_id" UUID NOT NULL,
    "class_subject_id" UUID NOT NULL,
    "exam_date" DATE,
    "max_marks" DECIMAL(7,2) NOT NULL,
    "pass_marks" DECIMAL(7,2),
    "component_name" VARCHAR(80),
    "sequence_no" SMALLINT NOT NULL,

    CONSTRAINT "exam_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mark_entries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "exam_subject_id" UUID NOT NULL,
    "student_enrolment_id" UUID NOT NULL,
    "marks_obtained" DECIMAL(7,2),
    "is_absent" BOOLEAN NOT NULL DEFAULT false,
    "remarks" VARCHAR(255),
    "entered_by" UUID NOT NULL,
    "approved_by" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mark_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "examinations_academic_year_id_status_idx" ON "examinations"("academic_year_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "examinations_academic_year_id_class_id_name_key" ON "examinations"("academic_year_id", "class_id", "name");

-- CreateIndex
CREATE INDEX "exam_subjects_class_subject_id_idx" ON "exam_subjects"("class_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_subjects_examination_id_sequence_no_key" ON "exam_subjects"("examination_id", "sequence_no");

-- CreateIndex
CREATE INDEX "mark_entries_student_enrolment_id_idx" ON "mark_entries"("student_enrolment_id");

-- CreateIndex
CREATE UNIQUE INDEX "mark_entries_exam_subject_id_student_enrolment_id_key" ON "mark_entries"("exam_subject_id", "student_enrolment_id");

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_examination_id_fkey" FOREIGN KEY ("examination_id") REFERENCES "examinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "class_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_exam_subject_id_fkey" FOREIGN KEY ("exam_subject_id") REFERENCES "exam_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_student_enrolment_id_fkey" FOREIGN KEY ("student_enrolment_id") REFERENCES "student_enrolments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "examinations" ADD CONSTRAINT "examinations_type_chk"
    CHECK ("exam_type" IN ('UNIT_TEST', 'HALF_YEARLY', 'ANNUAL', 'PRE_BOARD', 'OTHER'));
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_status_chk"
    CHECK ("status" IN ('DRAFT', 'SCHEDULED', 'MARKS_ENTRY', 'FINALIZED'));
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_dates_chk"
    CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date");

ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_max_chk" CHECK ("max_marks" > 0);
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_pass_chk"
    CHECK ("pass_marks" IS NULL OR ("pass_marks" >= 0 AND "pass_marks" <= "max_marks"));
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_sequence_chk" CHECK ("sequence_no" >= 1);
-- One row per subject and component (Theory / Practical …) within an exam.
CREATE UNIQUE INDEX "exam_subjects_component_key"
    ON "exam_subjects" ("examination_id", "class_subject_id", coalesce(lower("component_name"), ''));

ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_status_chk"
    CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'FINAL'));
-- Absent ⇔ no marks; otherwise marks are required and non-negative.
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_absent_chk"
    CHECK ("is_absent" = ("marks_obtained" IS NULL) AND ("marks_obtained" IS NULL OR "marks_obtained" >= 0));

-- Protected-row bypass: only development tooling (pnpm demo:clear) sets this, inside one transaction.
CREATE OR REPLACE FUNCTION "protected_delete_allowed"() RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.allow_protected_delete', true), '') = 'on'
$$;

-- A finalised exam is frozen: no edits, no reopening, no deletion.
CREATE OR REPLACE FUNCTION "examinations_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."status" = 'FINALIZED' THEN
        IF TG_OP = 'DELETE' AND "protected_delete_allowed"() THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'A finalised examination cannot be changed or deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "examinations_guard" BEFORE UPDATE OR DELETE ON "examinations"
    FOR EACH ROW EXECUTE FUNCTION "examinations_guard"();

-- Marks never exceed the maximum, and FINAL marks are locked.
CREATE OR REPLACE FUNCTION "mark_entries_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE max_allowed numeric;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."status" = 'FINAL' THEN
        IF TG_OP = 'DELETE' AND "protected_delete_allowed"() THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Final marks cannot be changed' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF NEW."marks_obtained" IS NOT NULL THEN
        SELECT "max_marks" INTO max_allowed FROM "exam_subjects" WHERE "id" = NEW."exam_subject_id";
        IF NEW."marks_obtained" > max_allowed THEN
            RAISE EXCEPTION 'Marks % exceed the maximum of %', NEW."marks_obtained", max_allowed
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "mark_entries_guard" BEFORE INSERT OR UPDATE OR DELETE ON "mark_entries"
    FOR EACH ROW EXECUTE FUNCTION "mark_entries_guard"();
