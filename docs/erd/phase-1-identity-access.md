# ERD — Phase 1: identity, access & audit

Migrations: `001_identity_access`, `002_audit_logs`. Source of truth: `apps/api/prisma/schema/*.prisma`.

```mermaid
erDiagram
    users ||--o{ user_roles : "has"
    roles ||--o{ user_roles : "assigned via"
    users |o--o{ user_roles : "assigned_by"
    roles ||--o{ role_permissions : "grants"
    permissions ||--o{ role_permissions : "granted via"
    users ||--o{ refresh_tokens : "sessions"
    refresh_tokens |o--o| refresh_tokens : "replaced_by"
    users |o--o{ audit_logs : "actor"

    users {
        uuid id PK "uuidv7()"
        varchar email UK "nullable, lower-case"
        varchar phone UK "nullable"
        varchar password_hash "Argon2id PHC"
        varchar full_name
        varchar status "ACTIVE | INACTIVE | LOCKED"
        boolean must_change_password
        timestamptz password_changed_at
        timestamptz last_login_at
        timestamptz created_at
        timestamptz updated_at
    }
    roles {
        uuid id PK
        varchar code UK "ADMIN, TEACHER, custom"
        varchar name
        text description
        boolean is_system
        timestamptz created_at
    }
    permissions {
        uuid id PK
        varchar code UK "e.g. users.read"
        varchar name
        varchar module
        text description
    }
    user_roles {
        uuid user_id PK, FK
        uuid role_id PK, FK
        timestamptz assigned_at
        uuid assigned_by FK
    }
    role_permissions {
        uuid role_id PK, FK
        uuid permission_id PK, FK
    }
    refresh_tokens {
        uuid id PK
        uuid user_id FK
        varchar token_hash UK "SHA-256"
        uuid family_id "session"
        uuid replaced_by_id FK, UK
        timestamptz expires_at
        timestamptz revoked_at
        timestamptz created_at
        text user_agent
        inet ip_address
    }
    audit_logs {
        uuid id PK
        uuid user_id FK "nullable"
        varchar action
        varchar entity_type
        uuid entity_id
        jsonb before_json
        jsonb after_json
        text reason
        inet ip_address
        text user_agent
        timestamptz created_at
    }
```

**Constraints not visible in the diagram** (hand-written in migration SQL):

- `users`: `CHECK (email IS NOT NULL OR phone IS NOT NULL)`, `CHECK (email = lower(email))`, status CHECK.
- `audit_logs`: triggers block `UPDATE`, `DELETE` and `TRUNCATE` (append-only).
- Delete rules: `user_roles`/`audit_logs` → users `RESTRICT`; `role_permissions` → roles `CASCADE`;
  `refresh_tokens` → users `CASCADE`.
