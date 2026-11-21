-- CreateTable
CREATE TABLE "teacher_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "academic_year_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "class_subject_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_assignments_section_id_idx" ON "teacher_assignments"("section_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_academic_year_id_employee_id_idx" ON "teacher_assignments"("academic_year_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_assignments_employee_id_section_id_class_subject_id_key" ON "teacher_assignments"("employee_id", "section_id", "class_subject_id");

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_section_id_academic_year_id_fkey" FOREIGN KEY ("section_id", "academic_year_id") REFERENCES "sections"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_class_subject_id_academic_year_id_fkey" FOREIGN KEY ("class_subject_id", "academic_year_id") REFERENCES "class_subjects"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;
