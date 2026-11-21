-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(50) NOT NULL,
    "level_order" SMALLINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_enquiries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "reference_number" VARCHAR(30) NOT NULL,
    "student_name" VARCHAR(160) NOT NULL,
    "class_sought_id" UUID NOT NULL,
    "date_of_birth" DATE,
    "guardian_name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "message" TEXT,
    "source" VARCHAR(50) NOT NULL DEFAULT 'WEBSITE',
    "status" VARCHAR(30) NOT NULL DEFAULT 'NEW',
    "assigned_to" UUID,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "converted_student_id" UUID,
    "created_ip" INET,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_follow_ups" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "enquiry_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "follow_up_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" VARCHAR(60),
    "notes" TEXT,
    "next_follow_up_at" TIMESTAMPTZ(6),

    CONSTRAINT "enquiry_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "classes_name_key" ON "classes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "classes_level_order_key" ON "classes"("level_order");

-- CreateIndex
CREATE UNIQUE INDEX "admission_enquiries_reference_number_key" ON "admission_enquiries"("reference_number");

-- CreateIndex
CREATE INDEX "admission_enquiries_status_submitted_at_idx" ON "admission_enquiries"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "admission_enquiries_assigned_to_idx" ON "admission_enquiries"("assigned_to");

-- CreateIndex
CREATE INDEX "admission_enquiries_class_sought_id_idx" ON "admission_enquiries"("class_sought_id");

-- CreateIndex
CREATE INDEX "admission_enquiries_phone_idx" ON "admission_enquiries"("phone");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_enquiry_id_follow_up_at_idx" ON "enquiry_follow_ups"("enquiry_id", "follow_up_at");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_next_follow_up_at_idx" ON "enquiry_follow_ups"("next_follow_up_at");

-- AddForeignKey
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_class_sought_id_fkey" FOREIGN KEY ("class_sought_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "admission_enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints and sequence
-- ---------------------------------------------------------------------------
ALTER TABLE "classes" ADD CONSTRAINT "classes_level_order_chk" CHECK ("level_order" >= 0);

ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_status_chk"
    CHECK ("status" IN ('NEW', 'CONTACTED', 'VISIT_SCHEDULED', 'ADMISSION_CONFIRMED', 'NOT_INTERESTED', 'CLOSED'));
ALTER TABLE "admission_enquiries" ADD CONSTRAINT "admission_enquiries_source_chk"
    CHECK ("source" IN ('WEBSITE', 'WALK_IN', 'PHONE', 'REFERRAL', 'OTHER'));

-- Gap-tolerant, concurrency-safe counter for human-readable reference numbers (ENQ-YYYY-NNNNN).
CREATE SEQUENCE "admission_enquiry_number_seq" START 1;
