-- Phase: admin panel polish (migration 026)
-- * Driver and conductor move from routes to vehicles (an active vehicle needs both).
-- * Driving licence details on staff records.
-- * Vehicle service history with parts and accompanying staff.

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "licence_expiry" DATE,
ADD COLUMN     "licence_number" VARCHAR(40);

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "conductor_employee_id" UUID,
ADD COLUMN     "driver_employee_id" UUID;

-- CreateTable
CREATE TABLE "vehicle_services" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "vehicle_id" UUID NOT NULL,
    "service_date" DATE NOT NULL,
    "garage_name" VARCHAR(120),
    "odometer_km" INTEGER NOT NULL,
    "next_service_km" INTEGER,
    "next_service_date" DATE,
    "labour_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "invoice_number" VARCHAR(60),
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_service_parts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "service_id" UUID NOT NULL,
    "part_name" VARCHAR(120) NOT NULL,
    "quantity" SMALLINT NOT NULL DEFAULT 1,
    "cost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "vehicle_service_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_service_staff" (
    "service_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,

    CONSTRAINT "vehicle_service_staff_pkey" PRIMARY KEY ("service_id","employee_id")
);

-- CreateIndex
CREATE INDEX "vehicle_services_vehicle_id_service_date_idx" ON "vehicle_services"("vehicle_id", "service_date");

-- CreateIndex
CREATE INDEX "vehicle_service_parts_service_id_idx" ON "vehicle_service_parts"("service_id");

-- CreateIndex
CREATE INDEX "vehicle_service_staff_employee_id_idx" ON "vehicle_service_staff"("employee_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_employee_id_fkey" FOREIGN KEY ("driver_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_conductor_employee_id_fkey" FOREIGN KEY ("conductor_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_service_parts" ADD CONSTRAINT "vehicle_service_parts_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "vehicle_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_service_staff" ADD CONSTRAINT "vehicle_service_staff_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "vehicle_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_service_staff" ADD CONSTRAINT "vehicle_service_staff_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Move today's route crew onto the vehicles (first active route wins; a person is placed on at
-- most one vehicle, and never as both driver and conductor).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT vehicle_id, driver_employee_id, attendant_employee_id
    FROM transport_routes
    WHERE vehicle_id IS NOT NULL
    ORDER BY is_active DESC, created_at
  LOOP
    IF r.driver_employee_id IS NOT NULL THEN
      UPDATE vehicles v SET driver_employee_id = r.driver_employee_id
      WHERE v.id = r.vehicle_id AND v.driver_employee_id IS NULL
        AND v.conductor_employee_id IS DISTINCT FROM r.driver_employee_id
        AND NOT EXISTS (
          SELECT 1 FROM vehicles o
          WHERE r.driver_employee_id IN (o.driver_employee_id, o.conductor_employee_id)
        );
    END IF;
    IF r.attendant_employee_id IS NOT NULL THEN
      UPDATE vehicles v SET conductor_employee_id = r.attendant_employee_id
      WHERE v.id = r.vehicle_id AND v.conductor_employee_id IS NULL
        AND v.driver_employee_id IS DISTINCT FROM r.attendant_employee_id
        AND NOT EXISTS (
          SELECT 1 FROM vehicles o
          WHERE r.attendant_employee_id IN (o.driver_employee_id, o.conductor_employee_id)
        );
    END IF;
  END LOOP;
END $$;

-- DropForeignKey
ALTER TABLE "transport_routes" DROP CONSTRAINT "transport_routes_attendant_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "transport_routes" DROP CONSTRAINT "transport_routes_driver_employee_id_fkey";

-- AlterTable
ALTER TABLE "transport_routes" DROP COLUMN "attendant_employee_id",
DROP COLUMN "driver_employee_id";

-- Crew rules.
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_crew_distinct_chk"
  CHECK (driver_employee_id IS NULL OR conductor_employee_id IS NULL
         OR driver_employee_id <> conductor_employee_id);
-- Older active vehicles may have no crew yet; every insert/update from now on must have both.
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_active_crew_chk"
  CHECK (status <> 'ACTIVE' OR (driver_employee_id IS NOT NULL AND conductor_employee_id IS NOT NULL))
  NOT VALID;
CREATE UNIQUE INDEX "vehicles_active_driver_key" ON "vehicles"("driver_employee_id")
  WHERE status = 'ACTIVE' AND driver_employee_id IS NOT NULL;
CREATE UNIQUE INDEX "vehicles_active_conductor_key" ON "vehicles"("conductor_employee_id")
  WHERE status = 'ACTIVE' AND conductor_employee_id IS NOT NULL;
CREATE INDEX "vehicles_driver_employee_id_idx" ON "vehicles"("driver_employee_id");
CREATE INDEX "vehicles_conductor_employee_id_idx" ON "vehicles"("conductor_employee_id");

-- Service record rules.
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_odometer_chk" CHECK (odometer_km >= 0);
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_next_km_chk"
  CHECK (next_service_km IS NULL OR next_service_km > odometer_km);
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_next_date_chk"
  CHECK (next_service_date IS NULL OR next_service_date > service_date);
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_labour_chk" CHECK (labour_cost >= 0);
ALTER TABLE "vehicle_service_parts" ADD CONSTRAINT "vehicle_service_parts_quantity_chk" CHECK (quantity > 0);
ALTER TABLE "vehicle_service_parts" ADD CONSTRAINT "vehicle_service_parts_cost_chk" CHECK (cost >= 0);
