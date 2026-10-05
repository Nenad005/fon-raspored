ALTER TABLE "subjects" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "timeslots" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_settings" ADD COLUMN "acknowledgedScheduleVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "schedule_version" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 0,
    "contentHash" VARCHAR(64),
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "schedule_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_version_singleton" CHECK ("id" = 1)
);
INSERT INTO "schedule_version" ("id") VALUES (1);
