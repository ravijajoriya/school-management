-- Phase 5 · 015_payments_receipts — manual payments, allocations and receipts.

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payment_number" VARCHAR(40) NOT NULL,
    "student_enrolment_id" UUID NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount_received" DECIMAL(12,2) NOT NULL,
    "payment_mode" VARCHAR(20) NOT NULL,
    "reference_number" VARCHAR(100),
    "bank_name" VARCHAR(100),
    "cheque_date" DATE,
    "cheque_status" VARCHAR(20),
    "notes" TEXT,
    "recorded_by" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'POSTED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payment_id" UUID NOT NULL,
    "student_fee_due_id" UUID NOT NULL,
    "allocated_amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payment_id" UUID NOT NULL,
    "receipt_number" VARCHAR(40) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" UUID NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancellation_reason" TEXT,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_number_key" ON "payments"("payment_number");

-- CreateIndex
CREATE INDEX "payments_student_enrolment_id_idx" ON "payments"("student_enrolment_id");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- CreateIndex
CREATE INDEX "payment_allocations_student_fee_due_id_idx" ON "payment_allocations"("student_fee_due_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_student_fee_due_id_key" ON "payment_allocations"("payment_id", "student_fee_due_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_payment_id_key" ON "receipts"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_number_key" ON "receipts"("receipt_number");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_enrolment_id_fkey" FOREIGN KEY ("student_enrolment_id") REFERENCES "student_enrolments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_student_fee_due_id_fkey" FOREIGN KEY ("student_fee_due_id") REFERENCES "student_fee_dues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_chk" CHECK ("amount_received" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_mode_chk"
    CHECK ("payment_mode" IN ('CASH', 'BANK_TRANSFER', 'CHEQUE'));
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_chk"
    CHECK ("status" IN ('POSTED', 'VOID', 'REVERSED'));
-- Cheque details exist exactly for cheque payments.
ALTER TABLE "payments" ADD CONSTRAINT "payments_cheque_chk" CHECK (
    ("payment_mode" = 'CHEQUE') = ("cheque_status" IS NOT NULL)
    AND ("cheque_status" IS NULL OR "cheque_status" IN ('PENDING', 'CLEARED', 'BOUNCED'))
    AND ("payment_mode" <> 'CHEQUE' OR ("reference_number" IS NOT NULL AND "cheque_date" IS NOT NULL))
);

-- A posted payment keeps its amount, student, date and mode forever; only its status, cheque
-- status and notes may change, and a void/reversed payment can never become posted again.
CREATE OR REPLACE FUNCTION "payments_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW."payment_number", NEW."student_enrolment_id", NEW."payment_date", NEW."amount_received",
        NEW."payment_mode", NEW."reference_number", NEW."bank_name", NEW."cheque_date", NEW."recorded_by", NEW."created_at")
       IS DISTINCT FROM
       (OLD."payment_number", OLD."student_enrolment_id", OLD."payment_date", OLD."amount_received",
        OLD."payment_mode", OLD."reference_number", OLD."bank_name", OLD."cheque_date", OLD."recorded_by", OLD."created_at") THEN
        RAISE EXCEPTION 'A posted payment cannot be edited; void it and record it again'
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD."status" <> 'POSTED' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
        RAISE EXCEPTION 'A void or reversed payment cannot be changed' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "payments_guard_update" BEFORE UPDATE ON "payments"
    FOR EACH ROW EXECUTE FUNCTION "payments_guard_update"();
CREATE TRIGGER "payments_no_delete" BEFORE DELETE ON "payments"
    FOR EACH ROW EXECUTE FUNCTION "fees_block_delete"();

ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_chk" CHECK ("allocated_amount" > 0);
CREATE TRIGGER "payment_allocations_no_update" BEFORE UPDATE ON "payment_allocations"
    FOR EACH ROW EXECUTE FUNCTION "fees_block_update"();
CREATE TRIGGER "payment_allocations_no_delete" BEFORE DELETE ON "payment_allocations"
    FOR EACH ROW EXECUTE FUNCTION "fees_block_delete"();

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_cancel_reason_chk"
    CHECK (NOT "is_cancelled" OR "cancellation_reason" IS NOT NULL);

-- A receipt's number and printed snapshot are frozen; it can only be cancelled (once).
CREATE OR REPLACE FUNCTION "receipts_guard_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW."payment_id", NEW."receipt_number", NEW."issued_at", NEW."issued_by", NEW."snapshot_json")
       IS DISTINCT FROM (OLD."payment_id", OLD."receipt_number", OLD."issued_at", OLD."issued_by", OLD."snapshot_json")
       OR (OLD."is_cancelled" AND (NOT NEW."is_cancelled" OR NEW."cancellation_reason" IS DISTINCT FROM OLD."cancellation_reason")) THEN
        RAISE EXCEPTION 'An issued receipt cannot be changed, only cancelled' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "receipts_guard_update" BEFORE UPDATE ON "receipts"
    FOR EACH ROW EXECUTE FUNCTION "receipts_guard_update"();
CREATE TRIGGER "receipts_no_delete" BEFORE DELETE ON "receipts"
    FOR EACH ROW EXECUTE FUNCTION "fees_block_delete"();
