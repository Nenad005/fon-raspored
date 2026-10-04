import {
  getMultiSessionGroups,
  getWeeklySessionCounts,
  termKey,
} from "~/lib/schedule-storage";
import type { RouterOutputs } from "~/trpc/react";

type Subjects = RouterOutputs["catalog"]["get"]["subjects"];
type Terms = Subjects[number]["terms"]["P"];

function indexTerms(terms: Terms) {
  const counts = getWeeklySessionCounts(terms);
  return {
    terms,
    byKey: new Map(terms.map((term) => [termKey(term), term])),
    weeklySessions: {
      counts,
      multiSessionGroups: getMultiSessionGroups(terms, counts),
    },
  };
}

const indexes = new WeakMap<Subjects, ReturnType<typeof buildIndex>>();

function buildIndex(subjects: Subjects) {
  return new Map(
    subjects.map((subject) => [
      subject.name,
      {
        years: subject.years.map((year) => `year${year}`),
        P: indexTerms(subject.terms.P),
        V: indexTerms(subject.terms.V),
      },
    ]),
  );
}

export function createScheduleCatalog(subjects: Subjects) {
  let index = indexes.get(subjects);
  if (!index) {
    index = buildIndex(subjects);
    indexes.set(subjects, index);
  }
  return index;
}
