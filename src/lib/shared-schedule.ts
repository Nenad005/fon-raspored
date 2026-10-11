import { z } from "zod";

export const shareLifetimeMs = 7 * 24 * 60 * 60 * 1000;
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/);
const text = z.string().trim().min(1).max(191);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const eventSchema = z
  .object({
    id: z.string().min(1).max(30),
    predmet: text,
    tip: z.enum(["P", "V"]),
    od: time,
    do: time,
    sala: text,
    grupe: z.array(text).max(100),
  })
  .refine((event) => event.od < event.do, "Neispravno vreme termina.");

export const sharedSnapshotSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(200),
    schedule: z.record(
      z.enum(["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak"]),
      z.array(eventSchema).max(100),
    ),
  })
  .superRefine((snapshot, ctx) => {
    const events = Object.values(snapshot.schedule).flat();
    if (
      !events.length ||
      events.length > 100 ||
      new Set(events.map((e) => e.id)).size !== events.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Izaberi od 1 do 100 različitih termina.",
      });
    }
    if (JSON.stringify(snapshot).length > 100_000) {
      ctx.addIssue({
        code: "custom",
        message: "Raspored je prevelik za deljenje.",
      });
    }
  });

export function shareExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

export function formatShareDate(date: Date | string) {
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Belgrade",
  }).format(new Date(date));
}
