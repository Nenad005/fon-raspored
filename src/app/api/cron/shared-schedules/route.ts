import { timingSafeEqual } from "node:crypto";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const [copies, buckets] = await db.$transaction([
    db.sharedSchedule.deleteMany({ where: { expiresAt: { lte: now } } }),
    db.shareRateLimit.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);
  return Response.json(
    { deleted: copies.count, rateLimitsDeleted: buckets.count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
