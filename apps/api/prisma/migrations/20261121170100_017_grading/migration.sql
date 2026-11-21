-- Phase 6 · 017_grading — grading scales and grade bands.

-- CreateTable
CREATE TABLE "grading_scales" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(100) NOT NULL,
    "academic_year_id" UUID,
    "class_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "grading_scale_id" UUID NOT NULL,
    "min_percentage" DECIMAL(5,2) NOT NULL,
    "max_percentage" DECIMAL(5,2) NOT NULL,
    "grade_label" VARCHAR(10) NOT NULL,
    "remark" VARCHAR(100),

    CONSTRAINT "grade_bands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grade_bands_grading_scale_id_idx" ON "grade_bands"("grading_scale_id");

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_grading_scale_id_fkey" FOREIGN KEY ("grading_scale_id") REFERENCES "grading_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_grading_scale_id_fkey" FOREIGN KEY ("grading_scale_id") REFERENCES "grading_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_range_chk"
    CHECK ("min_percentage" >= 0 AND "max_percentage" <= 100 AND "min_percentage" <= "max_percentage");

-- No two bands of one scale may overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_no_overlap"
    EXCLUDE USING gist ("grading_scale_id" WITH =, numrange("min_percentage", "max_percentage", '[]') WITH &&);

-- Bands of a scale used by a finalised exam are frozen, so published results never change.
CREATE OR REPLACE FUNCTION "grade_bands_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scale uuid;
BEGIN
    scale := CASE WHEN TG_OP = 'INSERT' THEN NEW."grading_scale_id" ELSE OLD."grading_scale_id" END;
    IF EXISTS (SELECT 1 FROM "examinations" WHERE "grading_scale_id" = scale AND "status" = 'FINALIZED') THEN
        IF TG_OP = 'DELETE' AND "protected_delete_allowed"() THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'This grading scale is used by a finalised examination and cannot be changed'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "grade_bands_guard" BEFORE INSERT OR UPDATE OR DELETE ON "grade_bands"
    FOR EACH ROW EXECUTE FUNCTION "grade_bands_guard"();
