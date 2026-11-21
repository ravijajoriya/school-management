-- Phase 7 · 020_complaints_meetings — complaint register and parent–teacher meetings.

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "reference_number" VARCHAR(30) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "subject" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "submitted_by_name" VARCHAR(160),
    "contact_phone" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "assigned_to" UUID,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_teacher_meetings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_enrolment_id" UUID NOT NULL,
    "teacher_employee_id" UUID NOT NULL,
    "meeting_at" TIMESTAMPTZ(6) NOT NULL,
    "venue" VARCHAR(160),
    "purpose" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_teacher_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "complaints_reference_number_key" ON "complaints"("reference_number");

-- CreateIndex
CREATE INDEX "complaints_status_created_at_idx" ON "complaints"("status", "created_at");

-- CreateIndex
CREATE INDEX "complaints_assigned_to_idx" ON "complaints"("assigned_to");

-- CreateIndex
CREATE INDEX "parent_teacher_meetings_teacher_employee_id_meeting_at_idx" ON "parent_teacher_meetings"("teacher_employee_id", "meeting_at");

-- CreateIndex
CREATE INDEX "parent_teacher_meetings_student_enrolment_id_idx" ON "parent_teacher_meetings"("student_enrolment_id");

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_teacher_meetings" ADD CONSTRAINT "parent_teacher_meetings_student_enrolment_id_fkey" FOREIGN KEY ("student_enrolment_id") REFERENCES "student_enrolments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_teacher_meetings" ADD CONSTRAINT "parent_teacher_meetings_teacher_employee_id_fkey" FOREIGN KEY ("teacher_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_teacher_meetings" ADD CONSTRAINT "parent_teacher_meetings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

CREATE SEQUENCE "complaint_reference_seq" START 1;

ALTER TABLE "complaints" ADD CONSTRAINT "complaints_category_chk"
    CHECK ("category" IN ('ACADEMIC', 'TRANSPORT', 'FEES', 'FACILITIES', 'STAFF', 'SAFETY', 'OTHER'));
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_status_chk"
    CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'));
-- A complaint can only be resolved or closed with resolution notes.
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_resolution_chk"
    CHECK ("status" IN ('OPEN', 'IN_PROGRESS') OR length(btrim(coalesce("resolution_notes", ''))) > 0);

ALTER TABLE "parent_teacher_meetings" ADD CONSTRAINT "parent_teacher_meetings_status_chk"
    CHECK ("status" IN ('SCHEDULED', 'COMPLETED', 'CANCELLED'));
-- A teacher can't have two scheduled meetings at the same moment.
CREATE UNIQUE INDEX "parent_teacher_meetings_teacher_employee_id_meeting_at_key"
    ON "parent_teacher_meetings" ("teacher_employee_id", "meeting_at") WHERE "status" = 'SCHEDULED';
