import { unstable_cache } from "next/cache";
import type { PrismaClient } from "@prisma/client";
import { getScheduleVersion } from "~/server/api/schedule-version";

/** Only shared catalog data belongs here; account reads must never be cached. */
export async function readPublicData<T>(
  ctx: { db: PrismaClient; cachePublicReads?: boolean },
  key: string[],
  read: () => Promise<T>,
): Promise<T> {
  // Direct callers can opt in when running in a Next.js request/cache context.
  if (!ctx.cachePublicReads) return read();
  // Check the release on every request: imports invalidate all public datasets
  // immediately, including when published outside Next.js by the import CLI.
  const { version } = await getScheduleVersion(ctx.db);
  return unstable_cache(read, ["public-schedule-v1", String(version), ...key], {
    revalidate: 3600,
  })();
}
