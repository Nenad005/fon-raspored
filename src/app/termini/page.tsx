"use client";

import { SignInButton } from "@clerk/nextjs";

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

import { Button } from "~/components/ui/button";
import TimeSlotSelector from "~/components/time-slot-selector";
import SelectedSlotsCalendar from "~/components/selected-slots-calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { createScheduleCatalog } from "~/lib/schedule-catalog";
import { useScheduleState } from "~/hooks/use-schedule-state";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  termKey,
  selectionKeys,
  getSelectionLimit,
  type Selections,
  type Term as SelectorTerm,
} from "~/lib/schedule-storage";

type Subject = RouterOutputs["catalog"]["get"]["subjects"][number];
type Term = Subject["terms"]["P"][number];
type ExistingSlot = { key: string; type: "P" | "V"; name: string; term: Term };

const yearLabels: Record<string, string> = {
  year1: "I godina",
  year2: "II godina",
  year3: "III godina",
  year4: "IV godina",
};

const timeslotBaseline = (data: RouterOutputs["account"]["get"]) =>
  JSON.stringify([[...data.subjectIds].sort(), [...data.timeslotIds].sort()]);

export default function TerminiPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, account } = useScheduleState();
  const catalog = api.catalog.get.useQuery(undefined, {
    enabled: Boolean(isLoaded && isSignedIn),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const utils = api.useUtils();
  const save = api.account.saveTimeslots.useMutation({
    onSuccess: (data) => utils.account.get.setData(undefined, data),
  });
  const scheduleCatalog = createScheduleCatalog(catalog.data?.subjects ?? []);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selections, setSelections] = useState<Selections>({});
  const [revision, setRevision] = useState<number | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [hadSavedTimeslots, setHadSavedTimeslots] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<ExistingSlot[]>([]);

  useEffect(() => {
    if (!account.data || !catalog.data) return;
    const data = account.data;
    const latestBaseline = timeslotBaseline(data);
    if (revision !== null) {
      // Preference-only updates can advance the revision without replacing drafts.
      if (latestBaseline === baseline && data.revision > revision)
        setRevision(data.revision);
      return;
    }
    const restored = data.subjectIds.flatMap((id) => {
      const subject = catalog.data.subjects.find(
        (subject) => subject.id === id,
      );
      return subject ? [subject] : [];
    });
    const savedIds = new Set(data.timeslotIds);
    const savedSelections: Selections = {};
    let resolved = 0;
    for (const subject of restored) {
      for (const type of ["P", "V"] as const) {
        const terms = subject.terms[type].filter((term) =>
          savedIds.has(term.id),
        );
        if (!terms.length) continue;
        resolved += terms.length;
        (savedSelections[subject.id] ??= {})[type] = terms.map(termKey);
      }
    }
    setSubjects(restored);
    setSelections(savedSelections);
    setHadSavedTimeslots(resolved > 0);
    setOutdated(
      restored.length !== data.subjectIds.length || resolved !== savedIds.size,
    );
    setRevision(data.revision);
    setBaseline(latestBaseline);
  }, [account.data, catalog.data, revision, baseline]);

  const selectedSlots = subjects.flatMap((subject) => {
    const key = subject.id;
    const indexed = scheduleCatalog.get(subject.name);
    return (["P", "V"] as const).flatMap((type) => {
      return selectionKeys(selections[key]?.[type]).flatMap((value) => {
        const term = indexed?.[type].byKey.get(value);
        return term ? [{ key, type, name: subject.name, term }] : [];
      });
    });
  });
  const withinLimits = subjects.every((subject) =>
    (["P", "V"] as const).every((type) => {
      const chosen = selectedSlots
        .filter((slot) => slot.key === subject.id && slot.type === type)
        .map((slot) => slot.term);
      const indexed = scheduleCatalog.get(subject.name)?.[type];
      return (
        chosen.length <=
        getSelectionLimit(
          indexed?.terms ?? [],
          chosen,
          indexed?.weeklySessions.counts,
        )
      );
    }),
  );
  const complete =
    subjects.length > 0 &&
    (selectedSlots.length > 0 || hadSavedTimeslots) &&
    withinLimits;

  function selectTerms(
    subject: Subject,
    type: "P" | "V",
    chosen: SelectorTerm[],
  ) {
    if (save.isPending) return;
    const indexed = scheduleCatalog.get(subject.name)?.[type];
    if (
      chosen.length >
      getSelectionLimit(
        indexed?.terms ?? [],
        chosen,
        indexed?.weeklySessions.counts,
      )
    )
      return;
    const key = subject.id;
    const values = chosen.map(termKey);
    const previous = selectionKeys(selections[key]?.[type]);
    const added = chosen.filter((term) => !previous.includes(termKey(term)));
    setPendingRemoval(
      selectedSlots.filter(
        (slot) =>
          (!(slot.key === key && slot.type === type) ||
            values.includes(termKey(slot.term))) &&
          added.some(
            (term) =>
              !(
                slot.key === key &&
                slot.type === type &&
                termKey(slot.term) === termKey(term)
              ) &&
              slot.term.dan === term.dan &&
              slot.term.od < term.do &&
              term.od < slot.term.do,
          ),
      ),
    );
    const multiple = (indexed?.weeklySessions.multiSessionGroups.size ?? 0) > 0;
    setSelections((current) => {
      const next = { ...current[key] };
      if (values.length) next[type] = multiple ? values : values[0]!;
      else delete next[type];
      const updated = { ...current, [key]: next };
      if (!Object.keys(next).length) delete updated[key];
      return updated;
    });
  }

  function removePreviousSlots() {
    if (save.isPending) return;
    setSelections((current) => {
      const next = { ...current };
      for (const slot of pendingRemoval) {
        const value = termKey(slot.term);
        const stored = next[slot.key]?.[slot.type];
        const keys = selectionKeys(stored);
        if (!keys.includes(value)) continue;
        const remaining = { ...next[slot.key] };
        const kept = keys.filter((key) => key !== value);
        if (kept.length)
          remaining[slot.type] = Array.isArray(stored) ? kept : kept[0]!;
        else delete remaining[slot.type];
        if (Object.keys(remaining).length) next[slot.key] = remaining;
        else delete next[slot.key];
      }
      return next;
    });
    setPendingRemoval([]);
  }

  function saveTerms() {
    if (!complete || revision === null || save.isPending) return;
    save.mutate(
      {
        timeslotIds: selectedSlots.map((slot) => slot.term.id),
        expectedRevision: revision,
      },
      { onSuccess: () => router.push("/") },
    );
  }

  if (!isLoaded) return <main role="status">Učitavanje naloga...</main>;
  if (!isSignedIn)
    return (
      <main>
        Prijavi se da izabereš termine.{" "}
        <SignInButton mode="modal">
          <Button>Prijava</Button>
        </SignInButton>
      </main>
    );
  if (account.isError || catalog.isError)
    return (
      <main role="alert">
        Podatke nije moguće učitati.{" "}
        <Button
          onClick={() => {
            void account.refetch();
            void catalog.refetch();
          }}
        >
          Pokušaj ponovo
        </Button>
      </main>
    );
  if (revision === null)
    return <main role="status">Učitavanje termina...</main>;

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

      {outdated && (
        <p role="alert">
          Neki sačuvani predmeti ili termini više nisu dostupni u katalogu.
        </p>
      )}
      {save.isError && (
        <p role="alert">
          Čuvanje nije uspelo. Izmene su i dalje u ovom obrascu, ali nisu
          sačuvane.{" "}
          <Button
            disabled={save.isPending}
            onClick={() => window.location.reload()}
          >
            Ponovo učitaj i odbaci izmene
          </Button>
        </p>
      )}
      <fieldset disabled={save.isPending} className="contents">
        <SelectedSlotsCalendar slots={selectedSlots} />

        {!withinLimits && (
          <p
            role="alert"
            className="mb-4 text-sm text-amber-600 dark:text-amber-400"
          >
            Za neki predmet imaš više izabranih termina nego što grupa ima
            nedeljno. Ukloni višak pre čuvanja rasporeda.
          </p>
        )}

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
              const key = subject.id;
              const subjectTerms = scheduleCatalog.get(subject.name);
              const availableTypes = (["P", "V"] as const).filter((type) =>
                Boolean(subjectTerms?.[type].terms.length),
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
                          {subject.years
                            .map((year) => `year${year}`)
                            .map((year) => yearLabels[year] ?? year)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                    {subjectTerms &&
                      availableTypes.length > 0 &&
                      Object.keys(selections[key] ?? {}).length > 0 && (
                        <Check className="h-5 w-5 text-green-600" />
                      )}
                  </div>
                  {availableTypes.length > 0 ? (
                    <div className="divide-y">
                      {(["P", "V"] as const).map((type) => {
                        const indexed = subjectTerms?.[type];
                        const options = indexed?.terms ?? [];
                        if (options.length === 0) return null;
                        const values = selectionKeys(
                          selections[key]?.[type],
                        ).flatMap((value) => {
                          const term = indexed?.byKey.get(value);
                          return term ? [term] : [];
                        });
                        const multiple =
                          (indexed?.weeklySessions.multiSessionGroups.size ??
                            0) > 0;
                        const conflicts = selectedSlots.filter((slot) =>
                          values.some(
                            (value) =>
                              !(
                                slot.key === key &&
                                slot.type === type &&
                                termKey(slot.term) === termKey(value)
                              ) &&
                              slot.term.dan === value.dan &&
                              slot.term.od < value.do &&
                              value.od < slot.term.do,
                          ),
                        );
                        const warning = `Ovaj termin se preklapa sa: ${conflicts.map((slot) => `${slot.name} (${slot.type === "P" ? "predavanje" : "vežbe"}, ${slot.term.od}-${slot.term.do})`).join(", ")}.`;
                        const isOccupied = (term: Term) =>
                          selectedSlots.some(
                            (selection) =>
                              !(
                                selection.key === key && selection.type === type
                              ) &&
                              selection.term.dan === term.dan &&
                              selection.term.od < term.do &&
                              term.od < selection.term.do,
                          );
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
                                    isOccupied(term)
                                      ? ("occupied" as const)
                                      : ("available" as const),
                                  ]),
                                )}
                                termini={options}
                                weeklySessions={indexed?.weeklySessions}
                                isOccupied={isOccupied}
                                value={values[0] ?? null}
                                values={multiple ? values : undefined}
                                onSaveMultiple={
                                  multiple
                                    ? (terms) =>
                                        selectTerms(subject, type, terms)
                                    : undefined
                                }
                                onSave={(term) =>
                                  selectTerms(subject, type, term ? [term] : [])
                                }
                                title={`${subject.name}: ${type === "P" ? "predavanje" : "vežbe"}`}
                              />
                              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                                {values.length ? (
                                  <span className="flex flex-col gap-1">
                                    {values.map((value) => (
                                      <span key={termKey(value)}>
                                        {value.dan} {value.od}-{value.do},{" "}
                                        {value.sala}
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  "Termin nije izabran"
                                )}
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
                  {selectedSlots.length}
                </span>{" "}
                izabranih termina
              </p>
              <Button
                onClick={saveTerms}
                disabled={!complete || save.isPending}
                className="gap-2"
              >
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
                Novi termin je dodat. Prethodni termini su i dalje izabrani. Da
                li želiš da ih ukloniš ili da zadržiš sve termine koji se
                preklapaju?
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 text-sm">
              {pendingRemoval.map((slot) => (
                <li key={`${slot.key}:${slot.type}:${termKey(slot.term)}`}>
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
              <Button
                disabled={save.isPending}
                variant="outline"
                onClick={() => setPendingRemoval([])}
              >
                Zadrži sve
              </Button>
              <Button
                disabled={save.isPending}
                variant="destructive"
                onClick={removePreviousSlots}
              >
                Ukloni prethodne
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </fieldset>
    </main>
  );
}
