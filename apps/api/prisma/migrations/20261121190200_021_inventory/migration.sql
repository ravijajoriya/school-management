-- Phase 7 · 021_inventory — asset categories and the item register.

-- CreateTable
CREATE TABLE "inventory_categories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "category_id" UUID NOT NULL,
    "asset_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unit" VARCHAR(30),
    "location" VARCHAR(120),
    "condition_status" VARCHAR(20) NOT NULL DEFAULT 'GOOD',
    "purchase_date" DATE,
    "purchase_cost" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_asset_code_key" ON "inventory_items"("asset_code");

-- CreateIndex
CREATE INDEX "inventory_items_category_id_idx" ON "inventory_items"("category_id");

-- CreateIndex
CREATE INDEX "inventory_items_condition_status_idx" ON "inventory_items"("condition_status");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "inventory_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------------------------

CREATE SEQUENCE "inventory_asset_code_seq" START 1;

CREATE UNIQUE INDEX "inventory_categories_name_key" ON "inventory_categories" (lower("name"));

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_quantity_chk" CHECK ("quantity" >= 0);
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_cost_chk"
    CHECK ("purchase_cost" IS NULL OR "purchase_cost" >= 0);
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_condition_chk"
    CHECK ("condition_status" IN ('GOOD', 'NEEDS_REPAIR', 'DAMAGED', 'DISPOSED'));
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_asset_code_upper_chk"
    CHECK ("asset_code" = upper("asset_code"));
