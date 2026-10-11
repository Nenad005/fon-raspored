import type { Metadata } from "next";
import Link from "next/link";
import SharedScheduleView from "~/components/shared-schedule-view";
import { Button } from "~/components/ui/button";
import {
  sharedSnapshotSchema,
  shareExpired,
  shareTokenSchema,
} from "~/lib/shared-schedule";
import { db } from "~/server/db";
import { getScheduleVersion } from "~/server/api/schedule-version";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Podeljeni raspored",
  description: "Privremena kopija nedeljnog FON rasporeda, dostupna 7 dana.",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
  openGraph: {
    title: "Podeljeni FON raspored",
    description: "Kopija rasporeda dostupna 7 dana.",
  },
};

function Unavailable({ expired = false }: { expired?: boolean }) {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-160px)] max-w-xl flex-col items-center gap-5 px-5 py-20 text-center">
      <h1 className="text-2xl font-semibold">
        {expired
          ? "Link za raspored je istekao."
          : "Podeljeni raspored nije dostupan."}
      </h1>
      <p className="text-muted-foreground">
        Podeljene kopije dostupne su 7 dana. Zamoli osobu koja ti je poslala
        link da napravi novi.
      </p>
      <Button asChild>
        <Link href="/">Otvori FON raspored</Link>
      </Button>
    </main>
  );
}

export default async function SharedSchedulePage({
  params,
}: {
  params: { token: string };
}) {
  if (!shareTokenSchema.safeParse(params.token).success) return <Unavailable />;
  const copy = await db.sharedSchedule.findUnique({
    where: { token: params.token },
  });
  if (!copy) return <Unavailable />;
  if (shareExpired(copy.expiresAt)) return <Unavailable expired />;
  const parsed = sharedSnapshotSchema.safeParse(copy.snapshot);
  if (!parsed.success) return <Unavailable />;
  const snapshot = parsed.data;
  const release = await getScheduleVersion(db);
  return (
    <SharedScheduleView
      schedule={snapshot.schedule}
      title={snapshot.title}
      createdAt={copy.createdAt.toISOString()}
      expiresAt={copy.expiresAt.toISOString()}
      updated={release.version !== copy.scheduleVersion}
    />
  );
}
