-- Subject names are unique regardless of case ("Hindi" and "hindi" are the same subject).
-- Expression index: not representable in the Prisma schema, so it lives only here.
CREATE UNIQUE INDEX "subjects_name_key" ON "subjects" (lower("name"));
