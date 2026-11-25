-- 025_holidays — school holiday calendar (single days or ranges per academic year).

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "academic_year_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "holidays_academic_year_id_start_date_idx" ON "holidays"("academic_year_id", "start_date");

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "holidays" ADD CONSTRAINT "holidays_dates_chk" CHECK ("end_date" >= "start_date");
-- Holidays of the same academic year never overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_no_overlap"
    EXCLUDE USING gist ("academic_year_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&);
