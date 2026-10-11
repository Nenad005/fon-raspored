import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { sharedSnapshotSchema, shareLifetimeMs } from "~/lib/shared-schedule";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { serializeTerm, timeslotSelect } from "~/server/api/catalog-data";
import { getScheduleVersion } from "~/server/api/schedule-version";

export const shareRouter = createTRPCRouter({
  create: publicProcedure
    .input(sharedSnapshotSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      // Vercel supplies this header; elsewhere use one shared bucket, not spoofable forwarded IPs.
      const source =
        process.env.VERCEL === "1"
          ? (ctx.headers.get("x-vercel-forwarded-for") ?? "unknown")
          : "local";
      const hour = Math.floor(now.getTime() / 3_600_000);
      const key = createHash("sha256")
        .update(`${process.env.CRON_SECRET ?? "share"}:${source}:${hour}`)
        .digest("hex");
      const limit = await ctx.db.shareRateLimit.upsert({
        where: { key },
        create: { key, hits: 1, expiresAt: new Date((hour + 2) * 3_600_000) },
        update: { hits: { increment: 1 } },
      });
      if (limit.hits > 20)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Previše kreiranih linkova. Pokušaj za sat vremena.",
        });

      return ctx.db.$transaction(
        async (db) => {
          const release = await getScheduleVersion(db);
          const slots = await db.timeslot.findMany({
            where: {
              id: {
                in: Object.values(input.schedule)
                  .flat()
                  .map((e) => e.id),
              },
              active: true,
              subject: { active: true },
            },
            select: { ...timeslotSelect, subject: { select: { name: true } } },
          });
          // Never label an outdated on-screen schedule as belonging to the current release.
          for (const [day, events] of Object.entries(input.schedule)) {
            for (const event of events) {
              const slot = slots.find((s) => s.id === event.id);
              const term = slot ? serializeTerm(slot) : null;
              if (
                !slot ||
                !term ||
                term.dan !== day ||
                slot.subject.name !== event.predmet ||
                slot.type !== event.tip ||
                term.od !== event.od ||
                term.do !== event.do ||
                term.sala !== event.sala ||
                event.grupe.some((group) => !term.grupe.includes(group))
              ) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message:
                    "Raspored je ažuriran. Osveži stranicu pre deljenja.",
                });
              }
            }
          }
          const token = randomBytes(24).toString("base64url");
          const expiresAt = new Date(now.getTime() + shareLifetimeMs);
          await db.sharedSchedule.create({
            data: {
              token,
              snapshot: input,
              scheduleVersion: release.version,
              createdAt: now,
              expiresAt,
            },
          });
          return { token, expiresAt };
        },
        { isolationLevel: "RepeatableRead" },
      );
    }),
});
