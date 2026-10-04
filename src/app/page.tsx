"use client";

import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  SlidersHorizontal,
} from "lucide-react";
import { useSetAtom } from "jotai";
import Link from "next/link";

import Raspored from "~/components/raspored";
import { Button } from "~/components/ui/button";
import { useScheduleState } from "~/hooks/use-schedule-state";
import { isOpenAtom } from "~/state/isOpenAtom";
import { api, type RouterOutputs } from "~/trpc/react";

export default function Home() {
  const {
    isLoaded,
    isSignedIn,
    account,
    mode,
    group: selectedGroup,
  } = useScheduleState();
  const setSettingsOpen = useSetAtom(isOpenAtom);
  const accountMode = Boolean(isSignedIn && mode === "account");
  const catalog = api.catalog.get.useQuery(undefined, {
    enabled: accountMode,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const subjectIds = new Set(account.data?.subjectIds ?? []);
  const timeslotIds = new Set(account.data?.timeslotIds ?? []);
  const selectedSubjects =
    catalog.data?.subjects.filter((subject) => subjectIds.has(subject.id)) ??
    [];
  const subjectsComplete = subjectIds.size > 0;
  const accountSchedule: RouterOutputs["schedule"]["getSchedule"]["schedule"] =
    {};
  for (const subject of selectedSubjects) {
    for (const type of ["P", "V"] as const) {
      for (const term of subject.terms[type]) {
        if (!timeslotIds.has(term.id)) continue;
        (accountSchedule[term.dan] ??= []).push({
          ...term,
          predmet: subject.name,
          tip: type,
        });
      }
    }
  }
  for (const events of Object.values(accountSchedule)) {
    events.sort((a, b) => a.od.localeCompare(b.od));
  }
  const setupComplete =
    subjectsComplete && Object.keys(accountSchedule).length > 0;
  const group = {
    group: selectedGroup?.name ?? null,
    year: selectedGroup ? `year${selectedGroup.year}` : null,
  };
  const accountError = Boolean(isSignedIn && account.isError);
  const catalogError = accountMode && catalog.isError;
  const ready = isSignedIn
    ? Boolean(isLoaded && account.data && (!accountMode || catalog.data))
    : Boolean(isLoaded || selectedGroup);
  const groupSchedule = api.schedule.getSchedule.useQuery(
    { year: selectedGroup?.year ?? 1, group: selectedGroup?.name ?? "" },
    {
      enabled: ready && !accountMode && !accountError && Boolean(selectedGroup),
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  );
  const publicScheduleLoading =
    ready &&
    !accountMode &&
    Boolean(group.group) &&
    !groupSchedule.data &&
    !groupSchedule.isError;
  const missingSelections =
    accountMode &&
    catalog.data &&
    account.data &&
    (selectedSubjects.length !== subjectIds.size ||
      Object.values(accountSchedule).flat().length !== timeslotIds.size);

  return (
    <main className="mx-auto flex min-h-[calc(100svh-160px)] w-full max-w-3xl flex-col items-center px-5 pb-28 pt-16">
      <div className="mb-20 flex flex-col items-center text-center">
        <h1 className="text-3xl font-medium">RASPORED NASTAVE</h1>
        <p className="mt-2 text-xl font-light">
          <span className="font-bold text-blue-300">ZIMSKI</span> semestar
          2026/27
        </p>
      </div>

      {(!ready || publicScheduleLoading) && !accountError && !catalogError && (
        <section
          role="status"
          aria-label="Učitavanje rasporeda"
          className="w-full"
        >
          <span className="sr-only">Učitavanje rasporeda...</span>
          <div
            aria-hidden="true"
            className="flex w-full animate-pulse flex-col items-center motion-reduce:animate-none"
          >
            <div className="h-5 w-40 rounded bg-secondary" />
            <div className="my-5 flex gap-2">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="h-8 w-12 rounded-md bg-secondary" />
              ))}
            </div>
            <div className="mb-2 flex gap-2">
              <div className="h-7 w-28 rounded-full bg-secondary" />
              <div className="h-7 w-20 rounded-full bg-secondary" />
            </div>
            <div className="mb-20 w-full md:w-[500px]">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 shrink-0 rounded-full bg-secondary" />
                    <div
                      className={`h-6 rounded bg-secondary ${index === 1 ? "w-3/5" : "w-4/5"}`}
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="h-6 w-28 rounded-full bg-secondary" />
                    <div className="h-6 w-16 rounded-full bg-secondary" />
                    <div className="h-6 w-20 rounded-full bg-secondary" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {(accountError || catalogError) && (
        <section
          role="alert"
          className="w-full max-w-md rounded-xl border p-6 text-center"
        >
          <p>Podatke nije moguće učitati. Pokušaj ponovo.</p>
          <Button
            className="mt-4"
            onClick={() =>
              void (accountError ? account.refetch() : catalog.refetch())
            }
          >
            Pokušaj ponovo
          </Button>
        </section>
      )}

      {missingSelections && !accountError && !catalogError && (
        <section
          role="alert"
          className="mb-6 w-full rounded-xl border p-5 text-center"
        >
          <p>Neki sačuvani izbori više nisu dostupni u učitanom katalogu.</p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => void catalog.refetch()}
          >
            Osveži katalog
          </Button>
        </section>
      )}

      {ready && !accountMode && !accountError && (
        <>
          {!group.group && (
            <section className="flex w-full flex-1 items-center justify-center">
              <div className="flex max-w-md flex-col items-center gap-5 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary">
                  <SlidersHorizontal className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">
                    Podesi pretragu rasporeda
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Izaberi godinu studija i grupu da prikažeš njen raspored.
                  </p>
                </div>
                <Button onClick={() => setSettingsOpen(true)}>
                  Podesi pretragu
                </Button>
              </div>
            </section>
          )}

          {group.group && groupSchedule.isError && (
            <section
              role="alert"
              className="w-full max-w-md rounded-xl border p-6 text-center"
            >
              <p className="font-medium">
                {groupSchedule.error?.data?.code === "NOT_FOUND"
                  ? "Izabrana grupa više nije dostupna."
                  : "Raspored nije moguće učitati."}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Pokušaj ponovo ili izaberi drugu grupu u podešavanjima.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Button
                  onClick={() => void groupSchedule.refetch()}
                  disabled={groupSchedule.isFetching}
                >
                  Pokušaj ponovo
                </Button>
                <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                  Podesi pretragu
                </Button>
              </div>
            </section>
          )}

          {group.group && groupSchedule.data && !groupSchedule.isError && (
            <section className="flex w-full flex-col items-center">
              <Raspored
                group={group}
                raspored={{ [group.group]: groupSchedule.data.schedule }}
              />
            </section>
          )}
        </>
      )}

      {ready &&
        accountMode &&
        !setupComplete &&
        !accountError &&
        !catalogError && (
          <section
            className="flex w-full flex-1 items-center justify-center"
            aria-labelledby="setup-title"
          >
            <div className="w-full max-w-xl">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Podešavanje rasporeda
                  </p>
                  <h2 id="setup-title" className="text-xl font-semibold">
                    Korak {subjectsComplete ? "2" : "1"} od 2
                  </h2>
                </div>
                <span className="text-sm text-muted-foreground">
                  {subjectsComplete ? "50%" : "0%"}
                </span>
              </div>
              <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full bg-foreground transition-all ${subjectsComplete ? "w-1/2" : "w-0"}`}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SetupCard
                  href="/predmeti"
                  icon={BookOpen}
                  title="Izaberi predmete"
                  description={
                    subjectsComplete
                      ? `${selectedSubjects.length} predmeta je izabrano`
                      : "Označi predmete koje slušaš"
                  }
                  complete={subjectsComplete}
                  active={!subjectsComplete}
                />
                <SetupCard
                  href={subjectsComplete ? "/termini" : undefined}
                  icon={Clock3}
                  title="Izaberi termine"
                  description="Odaberi predavanja i vežbe koje ti odgovaraju"
                  active={subjectsComplete}
                />
              </div>
            </div>
          </section>
        )}

      {ready &&
        accountMode &&
        setupComplete &&
        !accountError &&
        !catalogError && (
          <section className="flex w-full flex-col items-center">
            <Raspored
              group={{ group: "account", year: null }}
              raspored={{ account: accountSchedule }}
              label="Izabrani raspored"
            />
          </section>
        )}
    </main>
  );
}

function SetupCard({
  href,
  icon: Icon,
  title,
  description,
  active = false,
  complete = false,
}: {
  href?: string;
  icon: typeof BookOpen;
  title: string;
  description: string;
  active?: boolean;
  complete?: boolean;
}) {
  const content = (
    <div
      className={`group flex min-h-40 flex-col rounded-xl border p-5 transition-colors ${
        active ? "border-foreground bg-card" : "bg-muted/30"
      } ${href ? "hover:bg-accent" : "opacity-55"}`}
    >
      <div className="mb-7 flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
          {complete ? (
            <Check className="h-5 w-5" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
        </span>
        {href && (
          <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
        )}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
