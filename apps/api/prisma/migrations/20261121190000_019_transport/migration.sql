-- Phase 7 · 019_transport — vehicles, routes, stops and student transport assignments.

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "registration_number" VARCHAR(30) NOT NULL,
    "vehicle_type" VARCHAR(50),
    "capacity" SMALLINT,
    "insurance_expiry" DATE,
    "permit_expiry" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_routes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "vehicle_id" UUID,
    "driver_employee_id" UUID,
    "attendant_employee_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "route_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "pickup_time" TIME(0),
    "drop_time" TIME(0),
    "sequence_no" SMALLINT NOT NULL,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_transport" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "student_enrolment_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "route_stop_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_transport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_registration_number_key" ON "vehicles"("registration_number");

-- CreateIndex
CREATE INDEX "transport_routes_vehicle_id_idx" ON "transport_routes"("vehicle_id");

-- CreateIndex
CREATE INDEX "route_stops_route_id_idx" ON "route_stops"("route_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_id_route_id_key" ON "route_stops"("id", "route_id");

-- CreateIndex
CREATE INDEX "student_transport_student_enrolment_id_idx" ON "student_transport"("student_enrolment_id");

-- CreateIndex
CREATE INDEX "student_transport_route_id_end_date_idx" ON "student_transport"("route_id", "end_date");

-- AddForeignKey
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_driver_employee_id_fkey" FOREIGN KEY ("driver_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_attendant_employee_id_fkey" FOREIGN KEY ("attendant_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transport" ADD CONSTRAINT "student_transport_student_enrolment_id_fkey" FOREIGN KEY ("student_enrolment_id") REFERENCES "student_enrolments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transport" ADD CONSTRAINT "student_transport_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transport" ADD CONSTRAINT "student_transport_route_stop_id_route_id_fkey" FOREIGN KEY ("route_stop_id", "route_id") REFERENCES "route_stops"("id", "route_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transport" ADD CONSTRAINT "student_transport_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_status_chk" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_capacity_chk" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_registration_upper_chk"
    CHECK ("registration_number" = upper("registration_number"));

CREATE UNIQUE INDEX "transport_routes_name_key" ON "transport_routes" (lower("name"));

ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_sequence_chk" CHECK ("sequence_no" > 0);
CREATE UNIQUE INDEX "route_stops_route_id_name_key" ON "route_stops" ("route_id", lower("name"));

ALTER TABLE "student_transport" ADD CONSTRAINT "student_transport_dates_chk"
    CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
-- A student is on at most one route at any time (an open-ended assignment runs indefinitely).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "student_transport" ADD CONSTRAINT "student_transport_no_overlap"
    EXCLUDE USING gist ("student_enrolment_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&);
