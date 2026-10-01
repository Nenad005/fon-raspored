"use client";

import { useUser } from "@clerk/nextjs";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  SlidersHorizontal,
} from "lucide-react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import Link from "next/link";
import { useEffect, useState } from "react";

import Raspored from "~/components/raspored";
import { Button } from "~/components/ui/button";
import grupe from "~/data/raspored_grupa.json";
import raspored from "~/data/raspored_nastave.json";
import termini from "~/data/termini.json";
import { latinToCyrillic } from "~/lib/utils";
import {
  parseStoredSubjects,
  subjectKey,
  selectionKeys,
  retainSubjectTerms,
  termKey,
  getSubjectTerms,
  type Selections,
  type SelectedSubject,
} from "~/lib/schedule-storage";
import { isOpenAtom } from "~/state/isOpenAtom";
import { settingsAtom } from "~/state/settingsAtom";
import { scheduleModeAtom } from "~/state/scheduleModeAtom";
import { LAST_NAME_SEARCH_ENABLED } from "~/lib/search";

type Term = {
  dan: string;
  od: string;
  do: string;
  sala: string;
  grupe: string[];
};
type ScheduleEvent = Term & { predmet: string; tip: "P" | "V" };

function unicodeCompare(name1: string, name2: string) {
  return name1.localeCompare(name2, "sr", { sensitivity: "base" });
}

function assignGroup(year: string, smer: string, lastName: string) {
  const smerovi = (
    grupe as Record<
      string,
      Record<string, { grupa: string; od: string; do: string }[]>
    >
  )[year];
  if (!smerovi?.[smer]) return null;

  for (let index = 0; index < smerovi[smer].length; index++) {
    const grupaData = smerovi[smer][index]!;
    if (index === smerovi[smer].length - 1) return grupaData.grupa;
    if (
      unicodeCompare(grupaData.od, lastName) <= 0 &&
      unicodeCompare(lastName, grupaData.do) <= 0
    ) {
      return grupaData.grupa;
    }
  }

  return null;
}

type Settings = {
  search_by?: string;
  year?: string;
  class?: string;
  lastName?: string;
  group_year?: string;
  group?: string;
};

const defaultSettings: Settings = {
  search_by: "group",
  year: "year1",
  class: "",
  lastName: "",
  group_year: "year1",
  group: "",
};

export default function Home() {
  const { isLoaded: isUserLoaded, isSignedIn } = useUser();
  const [loaded, setLoaded] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState<SelectedSubject[]>(
    [],
  );
  const [selectedTerms, setSelectedTerms] = useState<Selections>({});
  const scheduleMode = useAtomValue(scheduleModeAtom);
  const [settings, setSettings] = useAtom(settingsAtom);
  const setSettingsOpen = useSetAtom(isOpenAtom);

  useEffect(() => {
    const settingsData = window.localStorage.getItem("SETTINGS");
    const subjectData = window.localStorage.getItem("SELECTED_SUBJECTS");
    const termData = window.localStorage.getItem("SELECTED_TERMS");

    if (settingsData) {
      setSettings(JSON.parse(settingsData) as Settings);
    } else {
      window.localStorage.setItem("SETTINGS", JSON.stringify(defaultSettings));
      setSettings(defaultSettings);
    }

    const subjects = parseStoredSubjects(
      subjectData,
      window.localStorage.getItem("SELECTED_SUBJECT_YEAR") ?? "year1",
    );
    setSelectedSubjects(subjects);
    try {
      setSelectedTerms(
        retainSubjectTerms(
          subjects,
          termData ? (JSON.parse(termData) as unknown) : {},
        ),
      );
    } catch {
      setSelectedTerms({});
    }
    setLoaded(true);
  }, [setSettings]);

  function getGroup() {
    const current = settings as Settings;
    const result = {
      group: null as string | null,
      year: null as string | null,
      message: "Uspešno",
    };

    if (current.search_by === "group") {
      if (!current.group_year)
        return { ...result, message: "Godina studija nije izabrana." };
      if (!current.group) return { ...result, message: "Grupa nije izabrana." };
      return { ...result, group: current.group, year: current.group_year };
    }

    if (LAST_NAME_SEARCH_ENABLED && current.search_by === "lastName") {
      if (!current.year)
        return { ...result, message: "Godina studija nije izabrana." };
      if (!current.class) return { ...result, message: "Smer nije izabran." };
      if (!current.lastName)
        return { ...result, message: "Prezime nije uneto." };

      return {
        ...result,
        group: assignGroup(
          current.year,
          current.class,
          latinToCyrillic(current.lastName),
        ),
        year: current.year,
      };
    }

    return { ...result, message: "Izaberi način pretrage u podešavanjima." };
  }

  const subjectsComplete = selectedSubjects.length > 0;
  const accountSchedule: Record<string, ScheduleEvent[]> = {};
  const availableTerms = termini as Record<
    string,
    Record<string, { P?: Term[]; V?: Term[] }>
  >;
  for (const subject of selectedSubjects) {
    const selections = selectedTerms[subjectKey(subject)];
    for (const type of ["P", "V"] as const) {
      for (const value of selectionKeys(selections?.[type])) {
        const term = getSubjectTerms(availableTerms, subject.name)[type].find(
          (option) => termKey(option) === value,
        );
        if (!term) continue;
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
  const group = getGroup();
  const ready = loaded && isUserLoaded;
  const accountMode = isSignedIn && scheduleMode === "account";

  return (
    <main className="mx-auto flex min-h-[calc(100svh-160px)] w-full max-w-3xl flex-col items-center px-5 pb-28 pt-16">
      <div className="mb-20 flex flex-col items-center text-center">
        <h1 className="text-3xl font-medium">RASPORED NASTAVE</h1>
        <p className="mt-2 text-xl font-light">
          <span className="font-bold text-blue-300">ZIMSKI</span> semestar
          2026/27
        </p>
      </div>

      {!ready && (
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

      {ready && !accountMode && (
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

          {group.group && (
            <section className="flex w-full flex-col items-center">
              <Raspored group={group} raspored={raspored} />
            </section>
          )}
        </>
      )}

      {ready && accountMode && !setupComplete && (
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

      {ready && accountMode && setupComplete && (
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
