-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "admission_number" VARCHAR(40) NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "middle_name" VARCHAR(80),
    "last_name" VARCHAR(80),
    "date_of_birth" DATE NOT NULL,
    "gender" VARCHAR(20),
    "blood_group" VARCHAR(5),
    "photo_storage_key" TEXT,
    "address_line1" VARCHAR(200),
    "address_line2" VARCHAR(200),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postal_code" VARCHAR(12),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_id" UUID NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "relationship" VARCHAR(40) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "occupation" VARCHAR(100),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "address_same_as_student" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrolments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "roll_number" VARCHAR(20),
    "enrolment_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "previous_enrolment_id" UUID,
    "exit_date" DATE,
    "exit_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_documents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_id" UUID NOT NULL,
    "document_type" VARCHAR(60) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_admission_number_key" ON "students"("admission_number");

-- CreateIndex
CREATE INDEX "students_last_name_first_name_idx" ON "students"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "student_guardians_student_id_idx" ON "student_guardians"("student_id");

-- CreateIndex
CREATE INDEX "student_guardians_phone_idx" ON "student_guardians"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrolments_previous_enrolment_id_key" ON "student_enrolments"("previous_enrolment_id");

-- CreateIndex
CREATE INDEX "student_enrolments_academic_year_id_class_id_idx" ON "student_enrolments"("academic_year_id", "class_id");

-- CreateIndex
CREATE INDEX "student_enrolments_section_id_status_idx" ON "student_enrolments"("section_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrolments_student_id_academic_year_id_key" ON "student_enrolments"("student_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrolments_section_id_roll_number_key" ON "student_enrolments"("section_id", "roll_number");

-- CreateIndex
CREATE INDEX "student_documents_student_id_idx" ON "student_documents"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_enquiries_converted_student_id_key" ON "admission_enquiries"("converted_student_id");

-- AddForeignKey
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_converted_student_id_fkey" FOREIGN KEY ("converted_student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_section_id_academic_year_id_class_id_fkey" FOREIGN KEY ("section_id", "academic_year_id", "class_id") REFERENCES "sections"("id", "academic_year_id", "class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_previous_enrolment_id_fkey" FOREIGN KEY ("previous_enrolment_id") REFERENCES "student_enrolments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written constraints and sequence
-- ---------------------------------------------------------------------------
ALTER TABLE "students" ADD CONSTRAINT "students_status_chk" CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'WITHDRAWN'));
ALTER TABLE "students" ADD CONSTRAINT "students_gender_chk" CHECK ("gender" IS NULL OR "gender" IN ('MALE', 'FEMALE', 'OTHER'));
ALTER TABLE "students" ADD CONSTRAINT "students_blood_group_chk"
    CHECK ("blood_group" IS NULL OR "blood_group" IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));

ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_relationship_chk"
    CHECK ("relationship" IN ('FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'));
-- One primary contact per student.
CREATE UNIQUE INDEX "student_guardians_one_primary_idx" ON "student_guardians" ("student_id") WHERE "is_primary";

ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_status_chk"
    CHECK ("status" IN ('ACTIVE', 'PROMOTED', 'RETAINED', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED'));
ALTER TABLE "student_enrolments" ADD CONSTRAINT "student_enrolments_exit_chk"
    CHECK ("exit_date" IS NULL OR "exit_date" >= "enrolment_date");

ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_size_chk" CHECK ("file_size_bytes" > 0);

-- Counter for automatic admission numbers (ADM-YYYY-NNNNN).
CREATE SEQUENCE "student_admission_number_seq" START 1;
