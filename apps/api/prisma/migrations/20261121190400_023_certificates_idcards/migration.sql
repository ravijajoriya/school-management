-- Phase 7 · 023_certificates_idcards — certificate templates/issues and ID card templates/batches.

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "template_html" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_issues" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "certificate_number" VARCHAR(40) NOT NULL,
    "template_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "student_enrolment_id" UUID,
    "issued_on" DATE NOT NULL,
    "issued_by" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "id_card_templates" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(100) NOT NULL,
    "audience" VARCHAR(20) NOT NULL,
    "layout" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "id_card_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "id_card_batches" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "template_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "filters" JSONB NOT NULL,
    "card_count" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "id_card_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificate_templates_code_key" ON "certificate_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_issues_certificate_number_key" ON "certificate_issues"("certificate_number");

-- CreateIndex
CREATE INDEX "certificate_issues_student_id_idx" ON "certificate_issues"("student_id");

-- CreateIndex
CREATE INDEX "certificate_issues_template_id_idx" ON "certificate_issues"("template_id");

-- CreateIndex
CREATE INDEX "id_card_batches_created_at_idx" ON "id_card_batches"("created_at");

-- AddForeignKey
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_student_enrolment_id_fkey" FOREIGN KEY ("student_enrolment_id") REFERENCES "student_enrolments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "id_card_batches" ADD CONSTRAINT "id_card_batches_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "id_card_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "id_card_batches" ADD CONSTRAINT "id_card_batches_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "id_card_batches" ADD CONSTRAINT "id_card_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_code_chk"
    CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,49}$');

-- An issued certificate is a permanent record: never edited, never deleted.
CREATE OR REPLACE FUNCTION "certificate_issues_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' AND "protected_delete_allowed"() THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'An issued certificate cannot be changed or deleted' USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER "certificate_issues_guard" BEFORE UPDATE OR DELETE ON "certificate_issues"
    FOR EACH ROW EXECUTE FUNCTION "certificate_issues_guard"();

ALTER TABLE "id_card_templates" ADD CONSTRAINT "id_card_templates_audience_chk" CHECK ("audience" IN ('STUDENT', 'STAFF'));
ALTER TABLE "id_card_batches" ADD CONSTRAINT "id_card_batches_card_count_chk" CHECK ("card_count" >= 0);
