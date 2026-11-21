-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(20) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_name_key" ON "academic_years"("name");

-- ---------------------------------------------------------------------------
-- Hand-written constraints
-- ---------------------------------------------------------------------------
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_dates_chk" CHECK ("end_date" > "start_date");
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_status_chk"
    CHECK ("status" IN ('DRAFT', 'ACTIVE', 'CLOSED'));
-- is_active mirrors status so the two can never disagree.
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_active_matches_status_chk"
    CHECK ("is_active" = ("status" = 'ACTIVE'));
-- At most one active academic year.
CREATE UNIQUE INDEX "academic_years_single_active_idx" ON "academic_years" ("is_active") WHERE "is_active";
