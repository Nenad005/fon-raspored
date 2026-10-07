import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";

export async function getScheduleVersion(db: Prisma.TransactionClient) {
  const release = await db.scheduleVersion.findUnique({
    where: { id: 1 },
    select: { version: true, publishedAt: true },
  });
  return {
    version: release?.version ?? 0,
    publishedAt: release?.publishedAt ?? null,
  };
}

export async function lockScheduleVersion(
  db: Prisma.TransactionClient,
  expected?: number,
) {
  await db.$queryRaw`SELECT id FROM schedule_version WHERE id = 1 FOR SHARE`;
  const release = await getScheduleVersion(db);
  if (expected !== undefined && expected !== release.version) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Raspored je ponovo ažuriran. Učitaj nove termine pre čuvanja.",
    });
  }
  return release;
}
