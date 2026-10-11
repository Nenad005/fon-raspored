CREATE TABLE "shared_schedules" (
    "token" VARCHAR(32) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "scheduleVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shared_schedules_pkey" PRIMARY KEY ("token")
);
CREATE INDEX "shared_schedules_expiresAt_idx" ON "shared_schedules"("expiresAt");

CREATE TABLE "share_rate_limits" (
    "key" VARCHAR(80) NOT NULL,
    "hits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "share_rate_limits_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "share_rate_limits_expiresAt_idx" ON "share_rate_limits"("expiresAt");
