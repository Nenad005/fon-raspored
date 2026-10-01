"use client";

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
import predmeti from "~/data/predmeti.json";
import {
  parseStoredSubjects,
  retainSubjectTerms,
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

const subjectYears = new Map<string, string>();
for (const name of new Set(
  years.flatMap((year) => Object.values(predmeti[year]).flat()),
)) {
  subjectYears.set(
    name,
    `${years
      .filter((year) =>
        Object.values(predmeti[year]).some((names) => names.includes(name)),
      )
      .map((year) => yearLabels[year].replace(" godina", ""))
      .join(" i ")} godina`,
  );
}

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

    const restoredPrograms: ProgramsByYear = {};
    if (savedPrograms) {
      try {
        const parsed: unknown = JSON.parse(savedPrograms);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const year of years) {
            const program = (parsed as Record<string, unknown>)[year];
            if (
              typeof program === "string" &&
              Object.keys(predmeti[year]).includes(program)
            ) {
              restoredPrograms[year] = program;
            }
          }
        }
      } catch {
        // Ignore malformed saved filters; subject selection is restored separately.
      }
    }
    if (
      !restoredPrograms[fallbackYear] &&
      legacyProgram &&
      Object.keys(predmeti[fallbackYear]).includes(legacyProgram)
    ) {
      restoredPrograms[fallbackYear] = legacyProgram;
    }
    setProgramsByYear(restoredPrograms);
  }, []);

  function changeProgram(program: string) {
    setProgramsByYear((current) => ({ ...current, [activeYear]: program }));
    setQuery("");
  }

  function addSubject(name: string) {
    const subject = { year: activeYear, name };
    const key = subjectKey(subject);

    setSelected((current) =>
      current.some((item) => subjectKey(item) === key)
        ? current
        : [...current, subject],
    );
  }

  function saveSubjects() {
    if (selected.length === 0) return;
    let savedTerms: unknown = {};
    try {
      savedTerms = JSON.parse(
        window.localStorage.getItem("SELECTED_TERMS") ?? "{}",
      );
    } catch {
      savedTerms = {};
    }
    window.localStorage.setItem("SELECTED_SUBJECT_YEAR", activeYear);
    window.localStorage.setItem(
      "SELECTED_SUBJECT_PROGRAMS",
      JSON.stringify(programsByYear),
    );
    window.localStorage.setItem("SELECTED_SUBJECTS", JSON.stringify(selected));
    window.localStorage.setItem(
      "SELECTED_TERMS",
      JSON.stringify(retainSubjectTerms(selected, savedTerms)),
    );
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
            Pregledaj katalog i dodaj predmete sa jedne ili više godina studija.
          </p>
        </div>
      </div>

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
                key={subjectKey(subject)}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{subject.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {subjectYears.get(subject.name)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Ukloni ${subject.name}`}
                  onClick={() =>
                    setSelected((current) =>
                      current.filter(
                        (item) => subjectKey(item) !== subjectKey(subject),
                      ),
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
            Još nema izabranih predmeta. Izaberi godinu i smer u katalogu ispod,
            pa klikni Dodaj pored predmeta koji želiš da slušaš.
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
                <SelectItem key={value} value={value}>
                  {value}
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
                Dodaj željene predmete. Isti predmet se bira samo jednom, čak i
                kada je dostupan na više godina.
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
            {visibleSubjects.map((name) => {
              const isSelected = selectedKeys.has(
                subjectKey({ year: activeYear, name }),
              );
              return (
                <div
                  key={name}
                  className="flex w-full items-center justify-between gap-4 border-b p-4 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {subjectYears.get(name)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSelected}
                    aria-label={`Dodaj ${name}`}
                    onClick={() => addSubject(name)}
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
