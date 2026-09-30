"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSetAtom } from "jotai";
import { scheduleModeAtom } from "~/state/scheduleModeAtom";

import { Button } from "~/components/ui/button";
import TimeSlotSelector from "~/components/time-slot-selector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import termini from "~/data/termini.json";
import {
  parseStoredSubjects,
  subjectKey,
  type SelectedSubject,
} from "~/lib/schedule-storage";

type Term = {
  od: string;
  do: string;
  sala: string;
  grupe: string[];
  dan: string;
};
type SubjectTerms = { P?: Term[]; V?: Term[] };
type Selections = Record<string, Record<string, string>>;
type ExistingSlot = { key: string; type: "P" | "V"; name: string; term: Term };

const yearLabels: Record<string, string> = {
  year1: "I godina",
  year2: "II godina",
  year3: "III godina",
  year4: "IV godina",
};

const termsByYear = termini as Record<string, Record<string, SubjectTerms>>;

export default function TerminiPage() {
  const router = useRouter();
  const setScheduleMode = useSetAtom(scheduleModeAtom);
  const [subjects, setSubjects] = useState<SelectedSubject[]>([]);
  const [selections, setSelections] = useState<Selections>({});
  const [loaded, setLoaded] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<ExistingSlot[]>([]);

  useEffect(() => {
    const savedSubjects = window.localStorage.getItem("SELECTED_SUBJECTS");
    const savedTerms = window.localStorage.getItem("SELECTED_TERMS");
    const fallbackYear =
      window.localStorage.getItem("SELECTED_SUBJECT_YEAR") ?? "year1";
    const parsedSubjects = parseStoredSubjects(savedSubjects, fallbackYear);
    let savedSelections: Selections = {};

    try {
      savedSelections = savedTerms
        ? (JSON.parse(savedTerms) as Selections)
        : {};
    } catch {
      savedSelections = {};
    }

    setSubjects(parsedSubjects);
    setSelections(
      Object.fromEntries(
        parsedSubjects.flatMap((subject) => {
          const selection =
            savedSelections[subjectKey(subject)] ??
            savedSelections[subject.name];
          return selection ? [[subjectKey(subject), selection]] : [];
        }),
      ),
    );
    setLoaded(true);
  }, []);

  const requiredSelections = subjects.reduce((count, subject) => {
    const types = termsByYear[subject.year]?.[subject.name];
    return count + (types?.P?.length ? 1 : 0) + (types?.V?.length ? 1 : 0);
  }, 0);
  const selectedCount = subjects.reduce(
    (count, subject) =>
      count + Object.keys(selections[subjectKey(subject)] ?? {}).length,
    0,
  );
  const complete = subjects.length > 0 && selectedCount > 0;
  const selectedSlots = subjects.flatMap((subject) => {
    const key = subjectKey(subject);
    return (["P", "V"] as const).flatMap((type) => {
      const term = termsByYear[subject.year]?.[subject.name]?.[type]?.find(
        (option) =>
          `${option.dan}|${option.od}|${option.do}|${option.sala}` ===
          selections[key]?.[type],
      );
      return term ? [{ key, type, name: subject.name, term }] : [];
    });
  });

  function selectTerm(
    subject: SelectedSubject,
    type: string,
    term: Term | null,
  ) {
    const key = subjectKey(subject);
    if (
      term &&
      selections[key]?.[type] !==
        `${term.dan}|${term.od}|${term.do}|${term.sala}`
    ) {
      setPendingRemoval(
        selectedSlots.filter(
          (slot) =>
            !(slot.key === key && slot.type === type) &&
            slot.term.dan === term.dan &&
            slot.term.od < term.do &&
            term.od < slot.term.do,
        ),
      );
    }
    setSelections((current) => {
      const next = { ...current[key] };
      if (term) next[type] = `${term.dan}|${term.od}|${term.do}|${term.sala}`;
      else delete next[type];
      const updated = { ...current, [key]: next };
      if (!Object.keys(next).length) delete updated[key];
      return updated;
    });
  }

  function removePreviousSlots() {
    setSelections((current) => {
      const next = { ...current };
      for (const slot of pendingRemoval) {
        const value = `${slot.term.dan}|${slot.term.od}|${slot.term.do}|${slot.term.sala}`;
        if (next[slot.key]?.[slot.type] !== value) continue;
        const remaining = { ...next[slot.key] };
        delete remaining[slot.type];
        if (Object.keys(remaining).length) next[slot.key] = remaining;
        else delete next[slot.key];
      }
      return next;
    });
    setPendingRemoval([]);
  }

  function saveTerms() {
    if (!complete) return;
    window.localStorage.setItem("SELECTED_TERMS", JSON.stringify(selections));
    setScheduleMode("account");
    router.push("/");
  }

  if (!loaded) return null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-32 pt-8 sm:pt-12">
      <Link
        href="/predmeti"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Predmeti
      </Link>

      <div className="mb-8 flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
          2
        </span>
        <div>
          <p className="text-sm text-muted-foreground">Korak 2 od 2</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Izbor termina
          </h1>
          <p className="mt-2 text-muted-foreground">
            Izaberi termine koje želiš da pratiš. Dovoljan je jedan termin;
            ostale možeš ostaviti neizabrane.
          </p>
        </div>
      </div>

      {subjects.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <CalendarDays className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <h2 className="font-semibold">Nema izabranih predmeta</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Prvo izaberi predmete koje slušaš.
          </p>
          <Button asChild className="mt-5">
            <Link href="/predmeti">Izaberi predmete</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {subjects.map((subject, index) => {
            const key = subjectKey(subject);
            const subjectTerms = termsByYear[subject.year]?.[subject.name];
            const availableTypes = (["P", "V"] as const).filter((type) =>
              Boolean(subjectTerms?.[type]?.length),
            );
            return (
              <section
                key={key}
                className="overflow-hidden rounded-xl border bg-card"
              >
                <div className="flex items-center justify-between gap-4 border-b p-5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h2 className="font-semibold">{subject.name}</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {yearLabels[subject.year] ?? subject.year}
                      </p>
                    </div>
                  </div>
                  {subjectTerms &&
                    availableTypes.length > 0 &&
                    Object.keys(selections[key] ?? {}).length > 0 && (
                      <Check className="h-5 w-5 text-green-600" />
                    )}
                </div>
                {subjectTerms ? (
                  <div className="divide-y">
                    {(["P", "V"] as const).map((type) => {
                      const options = subjectTerms[type] ?? [];
                      if (options.length === 0) return null;
                      const value =
                        options.find(
                          (term) =>
                            `${term.dan}|${term.od}|${term.do}|${term.sala}` ===
                            selections[key]?.[type],
                        ) ?? null;
                      const conflicts = value
                        ? selectedSlots.filter(
                            (slot) =>
                              !(slot.key === key && slot.type === type) &&
                              slot.term.dan === value.dan &&
                              slot.term.od < value.do &&
                              value.od < slot.term.do,
                          )
                        : [];
                      const warning = `Ovaj termin se preklapa sa: ${conflicts.map((slot) => `${slot.name} (${slot.type === "P" ? "predavanje" : "vežbe"}, ${slot.term.od}-${slot.term.do})`).join(", ")}.`;
                      return (
                        <div key={type} className="p-5">
                          <p className="mb-3 text-sm font-medium">
                            {type === "P" ? "Predavanje" : "Vežbe"}
                          </p>
                          <div className="flex flex-wrap items-center gap-3">
                            <TimeSlotSelector
                              slots_input={Object.fromEntries(
                                options.map((term) => [
                                  `${term.dan}-${term.od}`,
                                  selectedSlots.some(
                                    (selection) =>
                                      !(
                                        selection.key === key &&
                                        selection.type === type
                                      ) &&
                                      selection.term.dan === term.dan &&
                                      selection.term.od < term.do &&
                                      term.od < selection.term.do,
                                  )
                                    ? ("occupied" as const)
                                    : ("available" as const),
                                ]),
                              )}
                              termini={options}
                              value={value}
                              onSave={(term) => selectTerm(subject, type, term)}
                              title={`${subject.name}: ${type === "P" ? "predavanje" : "vežbe"}`}
                            />
                            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                              {value
                                ? `${value.dan} ${value.od}-${value.do}, ${value.sala}`
                                : "Termin nije izabran"}
                              {conflicts.length > 0 && (
                                <span
                                  title={warning}
                                  role="img"
                                  aria-label={warning}
                                  className="shrink-0 cursor-help text-amber-500 dark:text-amber-400"
                                >
                                  <TriangleAlert
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="p-5 text-sm text-muted-foreground">
                    Za ovaj predmet trenutno nema dostupnih termina.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {subjects.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {selectedCount}
              </span>{" "}
              izabrano od {requiredSelections} dostupnih termina
            </p>
            <Button onClick={saveTerms} disabled={!complete} className="gap-2">
              Sačuvaj raspored <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={pendingRemoval.length > 0}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval([]);
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Ukloni prethodne termine?</DialogTitle>
            <DialogDescription>
              Novi termin je dodat. Prethodni termini su i dalje izabrani. Da li
              želiš da ih ukloniš ili da zadržiš sve termine koji se preklapaju?
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {pendingRemoval.map((slot) => (
              <li key={`${slot.key}:${slot.type}`}>
                <p className="font-medium">
                  {slot.name} ({slot.type === "P" ? "predavanje" : "vežbe"})
                </p>
                <p className="text-muted-foreground">
                  {slot.term.dan} {slot.term.od}-{slot.term.do}
                </p>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemoval([])}>
              Zadrži sve
            </Button>
            <Button variant="destructive" onClick={removePreviousSlots}>
              Ukloni prethodne
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
