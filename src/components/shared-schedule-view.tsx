"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Raspored from "~/components/raspored";
import CalendarExport from "~/components/calendar-export";
import { Button } from "~/components/ui/button";
import type { WeeklySchedule } from "~/lib/calendar";
import { formatShareDate, shareExpired } from "~/lib/shared-schedule";

export default function SharedScheduleView({
  schedule,
  title,
  createdAt,
  expiresAt,
  updated,
}: {
  schedule: WeeklySchedule;
  title: string;
  createdAt: string;
  expiresAt: string;
  updated: boolean;
}) {
  const [expired, setExpired] = useState(() =>
    shareExpired(new Date(expiresAt)),
  );
  useEffect(() => {
    const check = () => setExpired(shareExpired(new Date(expiresAt)));
    const timer = window.setTimeout(
      check,
      Math.max(0, new Date(expiresAt).getTime() - Date.now()),
    );
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [expiresAt]);

  if (expired)
    return (
      <main className="flex flex-col items-center gap-5 px-5 py-20 text-center">
        <h1 className="text-2xl font-semibold">Link za raspored je istekao.</h1>
        <p>Zamoli osobu koja ti je poslala link da napravi novi.</p>
        <Button asChild>
          <Link href="/">Otvori FON raspored</Link>
        </Button>
      </main>
    );

  return (
    <main className="mx-auto flex min-h-[calc(100svh-160px)] w-full max-w-3xl flex-col items-center px-5 pb-28 pt-12">
      <header className="mb-8 space-y-3 text-center">
        <h1 className="text-3xl font-medium">Podeljeni raspored</h1>
        <p className="text-sm text-muted-foreground">
          Kopija od {formatShareDate(createdAt)} · dostupna do{" "}
          {formatShareDate(expiresAt)} (Beograd)
        </p>
        <p className="text-sm text-muted-foreground">
          Ova kopija se ne ažurira automatski i ne menja tvoj raspored.
        </p>
      </header>
      {updated && (
        <section
          role="alert"
          className="mb-6 w-full rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm"
        >
          <p className="font-semibold">
            Zvanični raspored je ažuriran nakon deljenja.
          </p>
          <p className="mt-1">
            Ovo je kopija sačuvana {formatShareDate(createdAt)}. Proveri da li
            su tvoji termini promenjeni.
          </p>
        </section>
      )}
      <section className="flex w-full flex-col items-center">
        <Raspored
          shared
          group={{ group: "shared", year: null }}
          raspored={{ shared: schedule }}
          label={title}
        />
        <p className="mb-4 text-center text-sm text-muted-foreground">
          U kalendar se izvozi ova kopija. Istek linka ne uklanja prethodno
          uvezene događaje.
        </p>
        <CalendarExport schedule={schedule} title={title} />
      </section>
      <Button className="mt-8" variant="outline" asChild>
        <Link href="/">Otvori moj raspored</Link>
      </Button>
    </main>
  );
}
