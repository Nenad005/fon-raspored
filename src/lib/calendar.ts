export type CalendarEvent = {
  id: string;
  predmet: string;
  tip: "P" | "V";
  od: string;
  do: string;
  sala: string;
  grupe: string[];
};

export type WeeklySchedule = Record<string, CalendarEvent[]>;
export const scheduleDays = [
  "Ponedeljak",
  "Utorak",
  "Sreda",
  "Četvrtak",
  "Petak",
] as const;
const dayMs = 86_400_000;

export function calendarToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addCalendarDays(date: string, days: number) {
  return new Date(parseDate(date) + days * dayMs).toISOString().slice(0, 10);
}

function parseDate(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  )
    throw new Error("Izaberi ispravan datum.");
  return timestamp;
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

// RFC 5545 limits content lines to 75 octets, not 75 Unicode characters.
function foldLine(value: string) {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const char of value) {
    const length = encoder.encode(char).length;
    if (bytes + length > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += char;
    bytes += length;
  }
  return result;
}

export function createCalendar({
  schedule,
  title,
  startDate,
  endDate,
  now = new Date(),
}: {
  schedule: WeeklySchedule;
  title: string;
  startDate: string;
  endDate: string;
  now?: Date;
}) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (end < start) throw new Error("Krajnji datum mora biti posle početnog.");
  if (end - start > 366 * dayMs)
    throw new Error("Izaberi period do godinu dana.");
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FON Raspored//SR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(title)}`,
    "X-WR-TIMEZONE:Europe/Belgrade",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Belgrade",
    "X-LIC-LOCATION:Europe/Belgrade",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T020000",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "DTSTART:19701025T030000",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  const seen = new Set<string>();
  let count = 0;
  for (const [index, day] of scheduleDays.entries()) {
    const delta = (index + 1 - new Date(start).getUTCDay() + 7) % 7;
    const first = start + delta * dayMs;
    if (first > end) continue;
    const date = new Date(first).toISOString().slice(0, 10).replace(/-/g, "");
    for (const event of schedule[day] ?? []) {
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.od) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.do) ||
        event.do <= event.od
      )
        throw new Error("Raspored sadrži neispravno vreme termina.");
      const key = `${day}|${event.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const type = event.tip === "P" ? "Predavanje" : "Vežbe";
      const description = `${type}\nGrupe: ${event.grupe.join(", ")}\n${title}\nIzvoz rasporeda; izmene na sajtu se ne prenose automatski. Praznici i pauze nisu isključeni.`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${encodeURIComponent(event.id)}-${index}-${startDate}-${endDate}@fon-raspored.vercel.app`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Europe/Belgrade:${date}T${event.od.replace(":", "")}00`,
        `DTEND;TZID=Europe/Belgrade:${date}T${event.do.replace(":", "")}00`,
        `RRULE:FREQ=WEEKLY;COUNT=${Math.floor((end - first) / (7 * dayMs)) + 1}`,
        `SUMMARY:${escapeText(`${event.predmet} — ${type}`)}`,
        `LOCATION:${escapeText(event.sala)}`,
        `DESCRIPTION:${escapeText(description)}`,
        "STATUS:CONFIRMED",
        "END:VEVENT",
      );
      count++;
    }
  }
  if (!count) throw new Error("U izabranom periodu nema termina za izvoz.");
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
