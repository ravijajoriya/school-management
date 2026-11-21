-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" VARCHAR(180) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "publish_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_notices" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" VARCHAR(180) NOT NULL,
    "body" TEXT NOT NULL,
    "audience_role_code" VARCHAR(50),
    "publish_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" VARCHAR(180) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "venue" VARCHAR(160),
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" VARCHAR(160),
    "category" VARCHAR(80),
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "alt_text" VARCHAR(255),
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_pages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "page_key" VARCHAR(80) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "content_json" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "published_content_json" JSONB,
    "published_at" TIMESTAMPTZ(6),
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "full_name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "handled_by" UUID,
    "handled_at" TIMESTAMPTZ(6),
    "created_ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "announcements_slug_key" ON "announcements"("slug");

-- CreateIndex
CREATE INDEX "announcements_status_publish_at_idx" ON "announcements"("status", "publish_at");

-- CreateIndex
CREATE INDEX "internal_notices_publish_at_idx" ON "internal_notices"("publish_at");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");

-- CreateIndex
CREATE INDEX "media_assets_category_is_public_created_at_idx" ON "media_assets"("category", "is_public", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "website_pages_page_key_key" ON "website_pages"("page_key");

-- CreateIndex
CREATE INDEX "contact_messages_status_created_at_idx" ON "contact_messages"("status", "created_at");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notices" ADD CONSTRAINT "internal_notices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (not expressible in Prisma schema)
-- ---------------------------------------------------------------------------
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_status_chk"
    CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_window_chk"
    CHECK ("expires_at" IS NULL OR "publish_at" IS NULL OR "expires_at" > "publish_at");

ALTER TABLE "internal_notices" ADD CONSTRAINT "internal_notices_window_chk"
    CHECK ("expires_at" IS NULL OR "publish_at" IS NULL OR "expires_at" > "publish_at");

ALTER TABLE "events" ADD CONSTRAINT "events_status_chk"
    CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'CANCELLED'));
ALTER TABLE "events" ADD CONSTRAINT "events_time_chk"
    CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at");

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_size_chk"
    CHECK ("file_size_bytes" > 0);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_category_chk"
    CHECK ("category" IS NULL OR "category" IN
        ('ACADEMIC', 'SPORTS', 'EVENTS', 'ACTIVITIES', 'CAMPUS', 'BANNER', 'FACILITY', 'GENERAL'));

ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_status_chk"
    CHECK ("status" IN ('DRAFT', 'PUBLISHED'));

ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_status_chk"
    CHECK ("status" IN ('NEW', 'READ', 'ARCHIVED'));
