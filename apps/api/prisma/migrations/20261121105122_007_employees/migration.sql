-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "employee_code" VARCHAR(40) NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80),
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "date_of_birth" DATE,
    "joining_date" DATE NOT NULL,
    "designation" VARCHAR(100) NOT NULL,
    "department" VARCHAR(100),
    "employment_type" VARCHAR(30),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "employee_id" UUID NOT NULL,
    "document_type" VARCHAR(60) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_idx" ON "employee_documents"("employee_id");

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_teacher_id_fkey" FOREIGN KEY ("class_teacher_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints and sequence
-- ---------------------------------------------------------------------------
ALTER TABLE "employees" ADD CONSTRAINT "employees_status_chk" CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'LEFT'));
ALTER TABLE "employees" ADD CONSTRAINT "employees_employment_type_chk"
    CHECK ("employment_type" IS NULL OR "employment_type" IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING'));
ALTER TABLE "employees" ADD CONSTRAINT "employees_email_lowercase_chk" CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_size_chk" CHECK ("file_size_bytes" > 0);

-- Counter for automatic employee codes (EMP-0001).
CREATE SEQUENCE "employee_code_seq" START 1;
