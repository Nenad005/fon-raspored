export type SelectedSubject = {
  year: string;
  name: string;
};

export function subjectKey(subject: SelectedSubject) {
  return `${subject.year}:${subject.name}`;
}

export function parseStoredSubjects(
  value: string | null,
  fallbackYear = "year1",
): SelectedSubject[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((subject) => {
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
    });
  } catch {
    return [];
  }
}
