import { z } from "zod";
import type { WeeklySchedule } from "~/lib/calendar";

export const offlineScheduleKey = "fon-raspored:offline:v1";
const snapshotSchema = z.object({
  version: z.literal(1),
  owner: z.string(),
  title: z.string(),
  savedAt: z.string().datetime(),
  schedule: z.record(
    z.array(
      z.object({
        id: z.string(),
        predmet: z.string(),
        tip: z.enum(["P", "V"]),
        od: z.string(),
        do: z.string(),
        sala: z.string(),
        grupe: z.array(z.string()),
      }),
    ),
  ),
});

export function saveOfflineSchedule(
  storage: Storage,
  owner: string,
  title: string,
  schedule: WeeklySchedule,
) {
  // Store only the visible schedule, not account credentials or the full catalog.
  const snapshot = snapshotSchema.parse({
    version: 1,
    owner,
    title,
    schedule,
    savedAt: new Date().toISOString(),
  });
  storage.setItem(offlineScheduleKey, JSON.stringify(snapshot));
}

export function clearOtherOfflineSchedule(storage: Storage, owner: string) {
  const raw = storage.getItem(offlineScheduleKey);
  if (!raw) return;
  try {
    const snapshot = snapshotSchema.safeParse(JSON.parse(raw));
    if (!snapshot.success || snapshot.data.owner !== owner)
      storage.removeItem(offlineScheduleKey);
  } catch {
    storage.removeItem(offlineScheduleKey);
  }
}
