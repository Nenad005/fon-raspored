export type SelectedSubject = {
  year: string;
  name: string;
};

export function subjectKey(subject: SelectedSubject) {
  return subject.name;
}

export type Term = {
  id?: string;
  groupKeys?: string[];
  dan: string;
  od: string;
  do: string;
  sala: string;
  grupe: string[];
};

export function termGroups(term: Term) {
  return term.groupKeys ?? term.grupe;
}

export function termKey(term: Term) {
  return `${term.dan}|${term.od}|${term.do}|${term.sala}`;
}

export type Selections = Record<string, Record<string, string | string[]>>;

export type TermCatalog = Record<
  string,
  Record<string, { P?: Term[]; V?: Term[] }>
>;

export type WeeklySessions = {
  counts: ReadonlyMap<string, number>;
  multiSessionGroups: ReadonlySet<string>;
};

type IndexedTerms = {
  terms: Term[];
  byKey: ReadonlyMap<string, Term>;
  weeklySessions: WeeklySessions;
};

export function createCatalogIndex(catalog: TermCatalog) {
  const yearsBySubject = new Map<string, string[]>();
  for (const [year, subjects] of Object.entries(catalog)) {
    for (const name of Object.keys(subjects)) {
      const years = yearsBySubject.get(name) ?? [];
      years.push(year);
      yearsBySubject.set(name, years);
    }
  }
  const index = new Map<
    string,
    { years: string[]; P: IndexedTerms; V: IndexedTerms }
  >();
  for (const [name, years] of yearsBySubject) {
    const merged = getSubjectTerms(catalog, name);
    const types = {} as Record<"P" | "V", IndexedTerms>;
    for (const type of ["P", "V"] as const) {
      const terms = merged[type];
      const counts = getWeeklySessionCounts(terms);
      types[type] = {
        terms,
        byKey: new Map(terms.map((term) => [termKey(term), term])),
        weeklySessions: {
          counts,
          multiSessionGroups: getMultiSessionGroups(terms, counts),
        },
      };
    }
    index.set(name, { years, ...types });
  }
  return index;
}

export function getSubjectTerms(catalog: TermCatalog, name: string) {
  const result: { P: Term[]; V: Term[] } = { P: [], V: [] };
  for (const type of ["P", "V"] as const) {
    const unique = new Map<string, Term>();
    for (const subjects of Object.values(catalog)) {
      for (const term of subjects[name]?.[type] ?? []) {
        const key = termKey(term);
        const previous = unique.get(key);
        unique.set(key, {
          ...term,
          grupe: [...new Set([...(previous?.grupe ?? []), ...term.grupe])],
        });
      }
    }
    result[type] = [...unique.values()];
  }
  return result;
}

export function intervalKey(term: Term) {
  return `${term.dan}|${term.od}|${term.do}`;
}

export function getWeeklySessionCounts(terms: Term[]) {
  const intervals = new Map<string, Set<string>>();
  for (const term of terms) {
    for (const group of termGroups(term)) {
      const sessions = intervals.get(group) ?? new Set<string>();
      sessions.add(intervalKey(term));
      intervals.set(group, sessions);
    }
  }
  return new Map(
    [...intervals].map(([group, sessions]) => [group, sessions.size]),
  );
}

export function getMultiSessionGroups(
  terms: Term[],
  counts: ReadonlyMap<string, number> = getWeeklySessionCounts(terms),
) {
  return new Set(
    [...counts].filter(([, count]) => count > 1).map(([group]) => group),
  );
}

export function getSelectionLimit(
  terms: Term[],
  choices: Term[],
  counts: ReadonlyMap<string, number> = getWeeklySessionCounts(terms),
) {
  return choices.length
    ? Math.min(
        ...choices.map((term) =>
          Math.max(
            1,
            ...termGroups(term).map((group) => counts.get(group) ?? 1),
          ),
        ),
      )
    : Math.max(1, ...counts.values());
}

export function selectionKeys(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (key): key is string => typeof key === "string" && key.length > 0,
      ),
    ),
  ];
}

export function retainSubjectTerms(
  subjects: SelectedSubject[],
  saved: unknown,
) {
  const retained: Selections = {};
  if (typeof saved !== "object" || saved === null || Array.isArray(saved))
    return retained;
  const selections = saved as Record<string, unknown>;
  for (const subject of subjects) {
    const key = subjectKey(subject);
    if (retained[key]) continue;
    // Prefer the unified choice, then the originally selected year when migrating.
    const candidates = [
      key,
      `${subject.year}:${subject.name}`,
      ...Object.keys(selections).filter((key) =>
        key.endsWith(`:${subject.name}`),
      ),
    ];
    const terms: Selections[string] = {};
    for (const type of ["P", "V"]) {
      for (const candidate of candidates) {
        const selection = selections[candidate];
        if (
          typeof selection !== "object" ||
          selection === null ||
          Array.isArray(selection)
        )
          continue;
        const value = (selection as Record<string, unknown>)[type];
        const keys = selectionKeys(value);
        if (!keys.length) continue;
        terms[type] = Array.isArray(value) ? keys : keys[0]!;
        break;
      }
    }
    if (Object.keys(terms).length) retained[key] = terms;
  }
  return retained;
}

export function parseStoredSubjects(
  value: string | null,
  fallbackYear = "year1",
): SelectedSubject[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    return parsed
      .flatMap((subject) => {
        if (typeof subject === "string") {
          return [{ year: fallbackYear, name: subject }];
        }

        if (
          typeof subject === "object" &&
          subject !== null &&
          "year" in subject &&
          "name" in subject &&
          typeof subject.year === "string" &&
          typeof subject.name === "string"
        ) {
          return [{ year: subject.year, name: subject.name }];
        }

        return [];
      })
      .filter((subject) => {
        if (!subject.name.trim() || seen.has(subject.name)) return false;
        seen.add(subject.name);
        return true;
      });
  } catch {
    return [];
  }
}
