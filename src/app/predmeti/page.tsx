"use client";

import { SignInButton } from "@clerk/nextjs";

import { ArrowLeft, Check, ChevronRight, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useScheduleState } from "~/hooks/use-schedule-state";
import { api, type RouterOutputs } from "~/trpc/react";

type Year = number;
type ProgramsByYear = Partial<Record<Year, string>>;
type Subject = RouterOutputs["catalog"]["get"]["subjects"][number];
const years = [1, 2, 3, 4];
const yearLabels: Record<Year, string> = {
  1: "I godina",
  2: "II godina",
  3: "III godina",
  4: "IV godina",
};
const subjectYears = (subject: Subject) =>
  subject.years
    .map((year) => yearLabels[year]?.replace(" godina", ""))
    .join(" i ") + " godina";

const subjectBaseline = (data: RouterOutputs["account"]["get"]) =>
  JSON.stringify([
    data.subjectIds,
    data.preferences.catalogYear,
    [...data.preferences.programFilters]
      .sort((a, b) => a.year - b.year || a.programId.localeCompare(b.programId))
      .map(({ year, programId }) => [year, programId]),
  ]);

export default function PredmetiPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, account } = useScheduleState();
  const catalog = api.catalog.get.useQuery(undefined, {
    enabled: Boolean(isLoaded && isSignedIn),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const utils = api.useUtils();
  const save = api.account.saveSubjects.useMutation({
    onSuccess: (data) => utils.account.get.setData(undefined, data),
  });
  const [revision, setRevision] = useState<number | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [hadSubjects, setHadSubjects] = useState(false);
  const [activeYear, setActiveYear] = useState<Year>(1);
  const [programsByYear, setProgramsByYear] = useState<ProgramsByYear>({});
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Subject[]>([]);
  const [outdated, setOutdated] = useState(false);

  const activeProgram = programsByYear[activeYear] ?? "";
  const programs =
    catalog.data?.programs.filter((program) =>
      program.years.includes(activeYear),
    ) ?? [];
  const subjects = activeProgram
    ? (catalog.data?.subjects.filter(
        (subject) =>
          subject.years.includes(activeYear) &&
          subject.memberships.some(
            (membership) =>
              membership.year === activeYear &&
              membership.programId === activeProgram,
          ),
      ) ?? [])
    : [];
  const visibleSubjects = subjects.filter((subject) =>
    subject.name
      .toLocaleLowerCase("sr")
      .includes(query.toLocaleLowerCase("sr")),
  );
  const selectedKeys = new Set(selected.map((subject) => subject.id));

  useEffect(() => {
    if (!account.data || !catalog.data) return;
    const data = account.data;
    const latestBaseline = subjectBaseline(data);
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
    setSelected(restored);
    setOutdated(restored.length !== data.subjectIds.length);
    setHadSubjects(data.subjectIds.length > 0);
    setActiveYear(data.preferences.catalogYear);
    setProgramsByYear(
      Object.fromEntries(
        data.preferences.programFilters.map(({ year, programId }) => [
          year,
          programId,
        ]),
      ),
    );
    setRevision(data.revision);
    setBaseline(latestBaseline);
  }, [account.data, catalog.data, revision, baseline]);

  function changeProgram(program: string) {
    setProgramsByYear((current) => ({ ...current, [activeYear]: program }));
    setQuery("");
  }

  function addSubject(subject: Subject) {
    if (save.isPending) return;
    setSelected((current) =>
      current.some((item) => item.id === subject.id)
        ? current
        : [...current, subject],
    );
  }

  function saveSubjects() {
    if (
      revision === null ||
      save.isPending ||
      (!selected.length && !hadSubjects)
    )
      return;
    save.mutate(
      {
        subjectIds: selected.map((subject) => subject.id),
        catalogYear: activeYear,
        programFilters: Object.entries(programsByYear).map(
          ([year, programId]) => ({
            year: Number(year),
            programId: programId!,
          }),
        ),
        expectedRevision: revision,
      },
      { onSuccess: () => router.push(selected.length ? "/termini" : "/") },
    );
  }

  if (!isLoaded) return <main role="status">Učitavanje naloga...</main>;
  if (!isSignedIn)
    return (
      <main>
        Prijavi se da izabereš predmete.{" "}
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
    return <main role="status">Učitavanje predmeta...</main>;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-32 pt-8 sm:pt-12">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Početna
      </Link>

      <div className="mb-8 flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
          1
        </span>
        <div>
          <p className="text-sm text-muted-foreground">Korak 1 od 2</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Izbor predmeta
          </h1>
          <p className="mt-2 text-muted-foreground">
            Pregledaj katalog i dodaj predmete sa jedne ili više godina studija.
          </p>
        </div>
      </div>

      {outdated && (
        <p role="alert">
          Neki sačuvani predmeti više nisu dostupni u katalogu.
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
        <section
          aria-labelledby="selected-subjects-heading"
          className="mb-8 rounded-xl border bg-card p-5"
        >
          <h2 id="selected-subjects-heading" className="text-xl font-semibold">
            Izabrani predmeti ({selected.length})
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Izabrani predmeti ostaju sačuvani dok menjaš godinu, smer ili
            pretragu.
          </p>
          {selected.length > 0 ? (
            <ul className="mt-4 divide-y">
              {selected.map((subject) => (
                <li
                  key={subject.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{subject.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {subjectYears(subject)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Ukloni ${subject.name}`}
                    onClick={() =>
                      setSelected((current) =>
                        current.filter((item) => item.id !== subject.id),
                      )
                    }
                    className="shrink-0 gap-2"
                  >
                    <X className="h-4 w-4" aria-hidden="true" /> Ukloni
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Još nema izabranih predmeta. Izaberi godinu i smer u katalogu
              ispod, pa klikni Dodaj pored predmeta koji želiš da slušaš.
            </p>
          )}
        </section>

        <section
          aria-labelledby="catalog-heading"
          className="mb-8 rounded-xl border bg-card p-5"
        >
          <h2 id="catalog-heading" className="mb-4 text-xl font-semibold">
            Katalog predmeta
          </h2>
          <Label>Godina studija</Label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {years.map((year) => (
              <button
                key={year}
                type="button"
                aria-pressed={activeYear === year}
                onClick={() => {
                  setActiveYear(year);
                  setQuery("");
                }}
                className={`flex min-h-14 items-center justify-between rounded-lg border px-3 text-left text-sm transition-colors ${activeYear === year ? "border-foreground bg-accent" : "hover:bg-accent/60"}`}
              >
                <span className="font-medium">{yearLabels[year]}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-2">
            <Label htmlFor="program">Smer za {yearLabels[activeYear]}</Label>
            <Select value={activeProgram} onValueChange={changeProgram}>
              <SelectTrigger id="program">
                <SelectValue placeholder="Izaberi smer" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((value) => (
                  <SelectItem key={value.id} value={value.id}>
                    {value.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Godina i smer filtriraju katalog. Promena filtera ne dodaje niti
              uklanja izabrane predmete.
            </p>
          </div>
        </section>

        {activeProgram ? (
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">
                  Predmeti, {yearLabels[activeYear]}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Dodaj željene predmete. Isti predmet se bira samo jednom, čak
                  i kada je dostupan na više godina.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Pretraži predmete"
                  aria-label="Pretraži predmete"
                />
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border">
              {visibleSubjects.map((subject) => {
                const { name } = subject;
                const isSelected = selectedKeys.has(subject.id);
                return (
                  <div
                    key={subject.id}
                    className="flex w-full items-center justify-between gap-4 border-b p-4 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {subjectYears(subject)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSelected}
                      aria-label={`Dodaj ${name}`}
                      onClick={() => addSubject(subject)}
                      className="shrink-0 gap-2"
                    >
                      {isSelected ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      )}
                      {isSelected ? "Dodato" : "Dodaj"}
                    </Button>
                  </div>
                );
              })}
              {visibleSubjects.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">
                  Nema predmeta za ovu pretragu.
                </p>
              )}
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">
            Izaberi smer za {yearLabels[activeYear]} da bi se prikazali
            predmeti.
          </div>
        )}

        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {selected.length}
              </span>{" "}
              izabrano
            </p>
            <Button
              onClick={saveSubjects}
              disabled={
                save.isPending || (selected.length === 0 && !hadSubjects)
              }
              className="gap-2"
            >
              Sačuvaj i nastavi <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </fieldset>
    </main>
  );
}
