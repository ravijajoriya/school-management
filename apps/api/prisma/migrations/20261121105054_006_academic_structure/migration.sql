-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(30),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "room_label" VARCHAR(50),
    "capacity" SMALLINT,
    "class_teacher_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_subjects" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "subject_type" VARCHAR(20) NOT NULL DEFAULT 'CORE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE INDEX "sections_class_id_idx" ON "sections"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_academic_year_id_class_id_name_key" ON "sections"("academic_year_id", "class_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sections_id_academic_year_id_key" ON "sections"("id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_id_academic_year_id_class_id_key" ON "sections"("id", "academic_year_id", "class_id");

-- CreateIndex
CREATE INDEX "class_subjects_subject_id_idx" ON "class_subjects"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_subjects_academic_year_id_class_id_subject_id_key" ON "class_subjects"("academic_year_id", "class_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_subjects_id_academic_year_id_key" ON "class_subjects"("id", "academic_year_id");

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints
-- ---------------------------------------------------------------------------
ALTER TABLE "sections" ADD CONSTRAINT "sections_capacity_chk" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_type_chk"
    CHECK ("subject_type" IN ('CORE', 'OPTIONAL', 'PRACTICAL'));
