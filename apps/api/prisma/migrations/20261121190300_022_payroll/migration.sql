-- Phase 7 · 022_payroll — salary components, monthly payroll runs, records and line items.

-- CreateTable
CREATE TABLE "salary_components" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(100) NOT NULL,
    "component_type" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_records" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payroll_run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deduction_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "payroll_record_id" UUID NOT NULL,
    "salary_component_id" UUID NOT NULL,
    "component_name" VARCHAR(100) NOT NULL,
    "component_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" VARCHAR(255),

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_period_start_key" ON "payroll_runs"("period_start");

-- CreateIndex
CREATE INDEX "payroll_records_employee_id_idx" ON "payroll_records"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_records_payroll_run_id_employee_id_key" ON "payroll_records"("payroll_run_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_payroll_record_id_salary_component_id_key" ON "payroll_items"("payroll_record_id", "salary_component_id");

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_record_id_fkey" FOREIGN KEY ("payroll_record_id") REFERENCES "payroll_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_salary_component_id_fkey" FOREIGN KEY ("salary_component_id") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

CREATE UNIQUE INDEX "salary_components_name_key" ON "salary_components" (lower("name"));
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_type_chk"
    CHECK ("component_type" IN ('EARNING', 'DEDUCTION'));

ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_status_chk" CHECK ("status" IN ('DRAFT', 'APPROVED', 'PAID'));
-- A run covers exactly one calendar month.
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_period_chk"
    CHECK ("period_start" = date_trunc('month', "period_start")::date
       AND "period_end" = (date_trunc('month', "period_start") + interval '1 month - 1 day')::date);
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_chk"
    CHECK ("status" = 'DRAFT' OR ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL));
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_paid_chk" CHECK ("status" <> 'PAID' OR "paid_at" IS NOT NULL);

ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_amounts_chk"
    CHECK ("gross_amount" >= 0 AND "deduction_amount" >= 0
       AND "net_amount" = "gross_amount" - "deduction_amount" AND "net_amount" >= 0);

ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_amount_chk" CHECK ("amount" >= 0);
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_type_chk"
    CHECK ("component_type" IN ('EARNING', 'DEDUCTION'));

-- Status moves DRAFT ⇄ APPROVED → PAID. A paid run is final; only a draft run can be deleted.
CREATE OR REPLACE FUNCTION "payroll_runs_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD."status" = 'DRAFT' OR "protected_delete_allowed"() THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Only a draft payroll can be deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD."status" = 'PAID' THEN
        RAISE EXCEPTION 'A paid payroll cannot be changed' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW."period_start" <> OLD."period_start" THEN
        RAISE EXCEPTION 'The payroll month cannot be changed' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW."status" <> OLD."status" AND NOT (
        (OLD."status" = 'DRAFT' AND NEW."status" = 'APPROVED') OR
        (OLD."status" = 'APPROVED' AND NEW."status" IN ('DRAFT', 'PAID'))
    ) THEN
        RAISE EXCEPTION 'Payroll cannot move from % to %', OLD."status", NEW."status" USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "payroll_runs_guard" BEFORE UPDATE OR DELETE ON "payroll_runs"
    FOR EACH ROW EXECUTE FUNCTION "payroll_runs_guard"();

-- Records and their lines can only change while the run is a draft.
CREATE OR REPLACE FUNCTION "payroll_lines_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run_status text;
BEGIN
    IF TG_OP = 'DELETE' AND "protected_delete_allowed"() THEN RETURN OLD; END IF;
    IF TG_TABLE_NAME = 'payroll_records' THEN
        SELECT r."status" INTO run_status FROM "payroll_runs" r
         WHERE r."id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."payroll_run_id" ELSE NEW."payroll_run_id" END;
    ELSE
        SELECT r."status" INTO run_status FROM "payroll_runs" r JOIN "payroll_records" p ON p."payroll_run_id" = r."id"
         WHERE p."id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."payroll_record_id" ELSE NEW."payroll_record_id" END;
    END IF;
    IF run_status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'This payroll is % and can no longer be edited', lower(coalesce(run_status, 'missing'))
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "payroll_records_guard" BEFORE INSERT OR UPDATE OR DELETE ON "payroll_records"
    FOR EACH ROW EXECUTE FUNCTION "payroll_lines_guard"();
CREATE TRIGGER "payroll_items_guard" BEFORE INSERT OR UPDATE OR DELETE ON "payroll_items"
    FOR EACH ROW EXECUTE FUNCTION "payroll_lines_guard"();
