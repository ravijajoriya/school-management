-- Phase 5 · 014_student_fee_ledger — student dues and adjustments.

-- CreateTable
CREATE TABLE "student_fee_dues" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_enrolment_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "description" VARCHAR(160) NOT NULL,
    "amount_due" DECIMAL(12,2) NOT NULL,
    "due_date" DATE,
    "academic_year_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "fee_structure_item_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_fee_dues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_adjustments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_fee_due_id" UUID NOT NULL,
    "adjustment_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "approved_by" UUID NOT NULL,
    "effective_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_fee_dues_academic_year_id_status_idx" ON "student_fee_dues"("academic_year_id", "status");

-- CreateIndex
CREATE INDEX "student_fee_dues_due_date_idx" ON "student_fee_dues"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_dues_student_enrolment_id_fee_structure_item_id_key" ON "student_fee_dues"("student_enrolment_id", "fee_structure_item_id");

-- CreateIndex
CREATE INDEX "fee_adjustments_student_fee_due_id_idx" ON "fee_adjustments"("student_fee_due_id");

-- CreateIndex
CREATE INDEX "fee_adjustments_effective_date_idx" ON "fee_adjustments"("effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrolments_id_academic_year_id_key" ON "student_enrolments"("id", "academic_year_id");

-- AddForeignKey
ALTER TABLE "student_fee_dues" ADD CONSTRAINT "student_fee_dues_student_enrolment_id_academic_year_id_fkey" FOREIGN KEY ("student_enrolment_id", "academic_year_id") REFERENCES "student_enrolments"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_dues" ADD CONSTRAINT "student_fee_dues_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_dues" ADD CONSTRAINT "student_fee_dues_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_dues" ADD CONSTRAINT "student_fee_dues_fee_structure_item_id_fkey" FOREIGN KEY ("fee_structure_item_id") REFERENCES "fee_structure_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_student_fee_due_id_fkey" FOREIGN KEY ("student_fee_due_id") REFERENCES "student_fee_dues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "student_fee_dues" ADD CONSTRAINT "student_fee_dues_amount_chk" CHECK ("amount_due" >= 0);
ALTER TABLE "student_fee_dues" ADD CONSTRAINT "student_fee_dues_status_chk"
    CHECK ("status" IN ('OPEN', 'PARTIAL', 'PAID', 'WAIVED'));

-- What a student was billed never changes; corrections are adjustments (or deleting an untouched due,
-- which the foreign keys from allocations/adjustments block once anything is attached).
CREATE OR REPLACE FUNCTION "student_fee_dues_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW."student_enrolment_id", NEW."academic_year_id", NEW."fee_head_id", NEW."amount_due", NEW."fee_structure_item_id")
       IS DISTINCT FROM
       (OLD."student_enrolment_id", OLD."academic_year_id", OLD."fee_head_id", OLD."amount_due", OLD."fee_structure_item_id") THEN
        RAISE EXCEPTION 'The billed amount, fee head and student of a due cannot be changed'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "student_fee_dues_guard_update" BEFORE UPDATE ON "student_fee_dues"
    FOR EACH ROW EXECUTE FUNCTION "student_fee_dues_guard_update"();

ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_type_chk"
    CHECK ("adjustment_type" IN ('CONCESSION', 'DISCOUNT', 'FINE', 'WAIVER'));
ALTER TABLE "fee_adjustments" ADD CONSTRAINT "fee_adjustments_amount_chk" CHECK ("amount" >= 0);

CREATE TRIGGER "fee_adjustments_no_update" BEFORE UPDATE ON "fee_adjustments"
    FOR EACH ROW EXECUTE FUNCTION "fees_block_update"();
CREATE TRIGGER "fee_adjustments_no_delete" BEFORE DELETE ON "fee_adjustments"
    FOR EACH ROW EXECUTE FUNCTION "fees_block_delete"();
