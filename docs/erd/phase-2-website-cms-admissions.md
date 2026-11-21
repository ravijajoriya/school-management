# ERD — Phase 2: public website, CMS & admission enquiries

Migrations: `003_public_cms`, `004_admission_enquiries`. Source of truth: `apps/api/prisma/schema/{cms,admissions}.prisma`.
`users` is from Phase 1 (only the relationships are shown here).

```mermaid
erDiagram
    users ||--o{ announcements : "created_by"
    users ||--o{ internal_notices : "created_by"
    users ||--o{ events : "created_by"
    users ||--o{ media_assets : "uploaded_by"
    users ||--o{ website_pages : "updated_by"
    users |o--o{ contact_messages : "handled_by"
    users |o--o{ admission_enquiries : "assigned_to"
    users ||--o{ enquiry_follow_ups : "user_id"
    classes ||--o{ admission_enquiries : "class_sought_id"
    admission_enquiries ||--o{ enquiry_follow_ups : "has"

    announcements {
        uuid id PK
        varchar title
        varchar slug UK
        text body "plain text"
        varchar status "DRAFT | PUBLISHED | ARCHIVED"
        timestamptz publish_at
        timestamptz expires_at
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }
    internal_notices {
        uuid id PK
        varchar title
        text body
        varchar audience_role_code "null = all staff"
        timestamptz publish_at
        timestamptz expires_at
        uuid created_by FK
        timestamptz created_at
    }
    events {
        uuid id PK
        varchar title
        varchar slug UK
        text description
        varchar venue
        timestamptz starts_at
        timestamptz ends_at
        varchar status "DRAFT | PUBLISHED | CANCELLED"
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at "added"
    }
    media_assets {
        uuid id PK
        varchar title
        varchar category "ACADEMIC … GENERAL"
        text storage_key
        varchar mime_type
        bigint file_size_bytes
        varchar alt_text
        boolean is_public
        uuid uploaded_by FK
        timestamptz created_at
    }
    website_pages {
        uuid id PK
        varchar page_key UK "site, home, about, …"
        varchar title
        jsonb content_json "draft"
        varchar status "DRAFT | PUBLISHED"
        jsonb published_content_json "added: live copy"
        timestamptz published_at "added"
        uuid updated_by FK
        timestamptz updated_at
    }
    contact_messages {
        uuid id PK "table added (not in PDF)"
        varchar full_name
        varchar email
        varchar phone
        text message
        varchar status "NEW | READ | ARCHIVED"
        uuid handled_by FK
        timestamptz handled_at
        inet created_ip
        timestamptz created_at
    }
    classes {
        uuid id PK "moved from Phase 3"
        varchar name UK
        smallint level_order UK
        boolean is_active
        timestamptz created_at
    }
    admission_enquiries {
        uuid id PK
        varchar reference_number UK "ENQ-YYYY-NNNNN"
        varchar student_name
        uuid class_sought_id FK
        date date_of_birth
        varchar guardian_name
        varchar phone
        varchar email
        text message
        varchar source "WEBSITE | WALK_IN | …"
        varchar status "NEW … CLOSED"
        uuid assigned_to FK
        timestamptz submitted_at
        uuid converted_student_id "FK added in Phase 3"
        inet created_ip
        timestamptz updated_at "added"
    }
    enquiry_follow_ups {
        uuid id PK
        uuid enquiry_id FK
        uuid user_id FK
        timestamptz follow_up_at
        varchar outcome
        text notes
        timestamptz next_follow_up_at
    }
```

**Hand-written constraints** (in migration SQL): status/source/category CHECKs, `announcements` and
`internal_notices` visibility window CHECK, `events.ends_at >= starts_at`, `media_assets.file_size_bytes > 0`,
`classes.level_order >= 0`, and the `admission_enquiry_number_seq` sequence. All new foreign keys use
`RESTRICT` (no cascade deletes).
