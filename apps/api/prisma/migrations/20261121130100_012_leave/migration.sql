-- Phase 4 · 012_leave — teacher leave applications and their review.

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "employee_id" UUID NOT NULL,
    "leave_type" VARCHAR(40) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_start_date_idx" ON "leave_requests"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "leave_requests_status_start_date_idx" ON "leave_requests"("status", "start_date");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_dates_chk"
    CHECK ("end_date" >= "start_date");

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_type_chk"
    CHECK ("leave_type" IN ('CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'ON_DUTY', 'UNPAID', 'OTHER'));

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_status_chk"
    CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

-- A decision always records who made it and when.
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_chk"
    CHECK ("status" NOT IN ('APPROVED', 'REJECTED') OR ("reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL));

-- One employee cannot hold two pending/approved requests for overlapping days.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_no_overlap"
    EXCLUDE USING gist ("employee_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&)
    WHERE ("status" IN ('PENDING', 'APPROVED'));
