-- Phase 5 · 013_fee_configuration — fee heads, fee plans and plan lines.

-- CreateTable
CREATE TABLE "fee_heads" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fee_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "billing_frequency" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structure_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "fee_structure_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "due_date" DATE,
    "installment_label" VARCHAR(80),
    "sequence_no" SMALLINT NOT NULL,

    CONSTRAINT "fee_structure_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_code_key" ON "fee_heads"("code");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_academic_year_id_class_id_name_key" ON "fee_structures"("academic_year_id", "class_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structure_items_fee_structure_id_sequence_no_key" ON "fee_structure_items"("fee_structure_id", "sequence_no");

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "fee_heads" ADD CONSTRAINT "fee_heads_code_upper_chk" CHECK ("code" = upper("code"));

ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_frequency_chk"
    CHECK ("billing_frequency" IN ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM'));

ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_amount_chk" CHECK ("amount" >= 0);
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_sequence_chk" CHECK ("sequence_no" >= 1);

-- Shared guard for financial tables: rows may never be deleted. The only bypass is a
-- transaction-local setting used by development tooling (pnpm demo:clear).
CREATE OR REPLACE FUNCTION "fees_block_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF current_setting('app.allow_financial_delete', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Financial records in % cannot be deleted; void or reverse them instead', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END $$;

-- Rows that may never change once written (adjustments, allocations).
CREATE OR REPLACE FUNCTION "fees_block_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Financial records in % cannot be changed once posted', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END $$;
