"use client";

import { ArrowLeft, Check, ChevronRight, Search } from "lucide-react";
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
import predmeti from "~/data/predmeti.json";
import {
  parseStoredSubjects,
  subjectKey,
  type SelectedSubject,
} from "~/lib/schedule-storage";

type Year = keyof typeof predmeti;
type ProgramsByYear = Partial<Record<Year, string>>;

const years = Object.keys(predmeti) as Year[];
const yearLabels: Record<Year, string> = {
  year1: "I godina",
  year2: "II godina",
  year3: "III godina",
  year4: "IV godina",
};

export default function PredmetiPage() {
  const router = useRouter();
  const [activeYear, setActiveYear] = useState<Year>("year1");
  const [programsByYear, setProgramsByYear] = useState<ProgramsByYear>({});
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedSubject[]>([]);

  const activeProgram = programsByYear[activeYear] ?? "";
  const programs = Object.keys(predmeti[activeYear]);
  const subjects = activeProgram
    ? ((predmeti[activeYear] as Record<string, string[]>)[activeProgram] ?? [])
    : [];
  const visibleSubjects = subjects.filter((subject) =>
    subject.toLocaleLowerCase("sr").includes(query.toLocaleLowerCase("sr")),
  );
  const selectedKeys = new Set(selected.map(subjectKey));
  const selectedInActiveYear = selected.filter(
    (subject) => subject.year === activeYear,
  ).length;

  useEffect(() => {
    const savedYear = window.localStorage.getItem(
      "SELECTED_SUBJECT_YEAR",
    ) as Year | null;
    const savedPrograms = window.localStorage.getItem(
      "SELECTED_SUBJECT_PROGRAMS",
    );
    const legacyProgram = window.localStorage.getItem(
      "SELECTED_SUBJECT_PROGRAM",
    );
    const fallbackYear =
      savedYear && savedYear in predmeti ? savedYear : "year1";

    setActiveYear(fallbackYear);
    setSelected(
      parseStoredSubjects(
        window.localStorage.getItem("SELECTED_SUBJECTS"),
        fallbackYear,
      ),
    );

    if (savedPrograms) {
      setProgramsByYear(JSON.parse(savedPrograms) as ProgramsByYear);
    } else if (legacyProgram) {
      setProgramsByYear({ [fallbackYear]: legacyProgram });
    }
  }, []);

  function changeProgram(program: string) {
    const programSubjects =
      (predmeti[activeYear] as Record<string, string[]>)[program] ?? [];

    setProgramsByYear((current) => ({ ...current, [activeYear]: program }));
    setSelected((current) => [
      ...current.filter((subject) => subject.year !== activeYear),
      ...programSubjects.map((name) => ({ year: activeYear, name })),
    ]);
  }

  function toggleSubject(name: string) {
    const subject = { year: activeYear, name };
    const key = subjectKey(subject);

    setSelected((current) =>
      current.some((item) => subjectKey(item) === key)
        ? current.filter((item) => subjectKey(item) !== key)
        : [...current, subject],
    );
  }

  function saveSubjects() {
    if (selected.length === 0) return;
    window.localStorage.setItem("SELECTED_SUBJECT_YEAR", activeYear);
    window.localStorage.setItem(
      "SELECTED_SUBJECT_PROGRAMS",
      JSON.stringify(programsByYear),
    );
    window.localStorage.setItem("SELECTED_SUBJECTS", JSON.stringify(selected));
    window.localStorage.removeItem("SELECTED_TERMS");
    router.push("/termini");
  }

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
            Dodaj predmete sa jedne ili više godina studija.
          </p>
        </div>
      </div>

      <section className="mb-8 rounded-xl border bg-card p-5">
        <Label>Godina studija</Label>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {years.map((year) => {
            const count = selected.filter(
              (subject) => subject.year === year,
            ).length;
            return (
              <button
                key={year}
                type="button"
                onClick={() => {
                  setActiveYear(year);
                  setQuery("");
                }}
                className={`flex min-h-14 items-center justify-between rounded-lg border px-3 text-left text-sm transition-colors ${activeYear === year ? "border-foreground bg-accent" : "hover:bg-accent/60"}`}
              >
                <span className="font-medium">{yearLabels[year]}</span>
                {count > 0 && (
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 text-xs text-background">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-2">
          <Label htmlFor="program">Smer za {yearLabels[activeYear]}</Label>
          <Select value={activeProgram} onValueChange={changeProgram}>
            <SelectTrigger id="program">
              <SelectValue placeholder="Izaberi smer" />
            </SelectTrigger>
            <SelectContent>
              {programs.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Promena godine čuva prethodne izbore. Promena smera zamenjuje samo
            predmete aktivne godine.
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
                Izabrano {selectedInActiveYear} ove godine, {selected.length}{" "}
                ukupno
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Pretraži predmete"
              />
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border">
            {visibleSubjects.map((name) => {
              const isSelected = selectedKeys.has(
                subjectKey({ year: activeYear, name }),
              );
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleSubject(name)}
                  className="flex w-full items-center gap-4 border-b p-4 text-left transition-colors last:border-0 hover:bg-accent"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isSelected ? "border-foreground bg-foreground text-background" : "bg-background"}`}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="font-medium">{name}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">
          Izaberi smer za {yearLabels[activeYear]} da bi se prikazali predmeti.
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
            disabled={selected.length === 0}
            className="gap-2"
          >
            Sačuvaj i nastavi <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </main>
  );
}
