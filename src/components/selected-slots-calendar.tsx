"use client";

import { CalendarDays, Clock3, MapPin, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { cn } from "~/lib/utils";
import { termKey, type Term } from "~/lib/schedule-storage";

type SelectedSlot = {
  key: string;
  name: string;
  type: "P" | "V";
  term: Term;
};

const days = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak"];
const shortDays = ["Pon", "Uto", "Sre", "Čet", "Pet"];
const defaultTimes = ["08:15", "10:15", "12:15", "14:15", "16:15", "18:15"];

export default function SelectedSlotsCalendar({
  slots,
}: {
  slots: SelectedSlot[];
}) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [pinnedCell, setPinnedCell] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(days[0]!);
  const minutes = (time: string) => {
    const [hours = 0, minutes = 0] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const formatTime = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const defaultStart = minutes(defaultTimes[0]!);
  const firstMinute =
    defaultStart +
    Math.floor(
      (Math.min(defaultStart, ...slots.map((slot) => minutes(slot.term.od))) -
        defaultStart) /
        120,
    ) *
      120;
  const lastMinute = Math.max(
    minutes("20:15"),
    ...slots.map((slot) => minutes(slot.term.do)),
  );
  const times = Array.from(
    { length: Math.ceil((lastMinute - firstMinute) / 120) },
    (_, index) => formatTime(firstMinute + index * 120),
  );
  const cells = times.flatMap((rowTime) =>
    days.flatMap((day) => {
      const start = minutes(rowTime);
      const rowSlots = slots.filter(
        (slot) =>
          slot.term.dan === day &&
          minutes(slot.term.od) < start + 120 &&
          start < minutes(slot.term.do),
      );
      const split = rowSlots.some(
        (slot) => minutes(slot.term.do) - minutes(slot.term.od) === 45,
      );
      return (split ? [0, 60] : [0]).map((offset) => ({
        key: `${day}|${rowTime}|${offset}`,
        day,
        rowTime,
        time: formatTime(start + offset),
        start: start + offset,
        end: start + offset + (split ? 60 : 120),
        split,
        offset,
        slots: rowSlots.filter(
          (slot) =>
            minutes(slot.term.od) < start + offset + (split ? 60 : 120) &&
            start + offset < minutes(slot.term.do),
        ),
      }));
    }),
  );
  const activeCell = cells.find(
    (cell) => cell.key === (hoveredCell ?? pinnedCell),
  );

  return (
    <section
      className="mb-8 min-w-0 overflow-hidden rounded-xl border bg-card"
      aria-labelledby="weekly-calendar-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:gap-4 sm:p-5">
        <div>
          <h2
            id="weekly-calendar-title"
            className="flex items-center gap-2 text-lg font-semibold sm:text-xl"
          >
            <CalendarDays className="h-5 w-5" /> Pregled nedelje
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="sm:hidden">
              Izaberi dan i dodirni termin za detalje.
            </span>
            <span className="hidden sm:inline">
              Pređi mišem ili klikni na termin za detalje.
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
            Predavanje
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
            Vežbe
          </span>
        </div>
      </div>

      <div
        role="group"
        aria-label="Dan u mobilnom kalendaru"
        className="mb-3 grid grid-cols-5 gap-1 px-3 sm:hidden"
      >
        {days.map((day, index) => {
          const count = slots.filter((slot) => slot.term.dan === day).length;
          return (
            <button
              key={day}
              type="button"
              aria-label={`${day}, broj izabranih termina: ${count}`}
              aria-pressed={selectedDay === day}
              onClick={() => {
                setSelectedDay(day);
                setHoveredCell(null);
                setPinnedCell(null);
              }}
              className={cn(
                "flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedDay === day
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {shortDays[index]}
              <span className="text-[10px] leading-none">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto px-3 pb-3 sm:px-5">
        <div
          role="table"
          aria-label="Nedeljni pregled izabranih predavanja i vežbi"
          className="w-full min-w-0 text-sm sm:min-w-[600px]"
        >
          <div role="rowgroup">
            <div
              role="row"
              className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-1 sm:grid-cols-[3.5rem_repeat(5,minmax(0,1fr))]"
            >
              <div role="columnheader">
                <span className="sr-only">Vreme</span>
              </div>
              {days.map((day) => (
                <div
                  key={day}
                  role="columnheader"
                  className={cn(
                    "pb-2 text-center font-medium",
                    day !== selectedDay && "hidden sm:block",
                  )}
                >
                  {day}
                </div>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            {times.map((time) => (
              <div
                role="row"
                key={time}
                className="mb-1 grid w-full grid-cols-[3rem_minmax(0,1fr)] gap-x-1 sm:grid-cols-[3.5rem_repeat(5,minmax(0,1fr))]"
                style={{ height: 96 }}
              >
                <div
                  role="rowheader"
                  className="overflow-hidden pt-1 text-left text-xs font-normal text-muted-foreground"
                >
                  {time}
                </div>
                {days.map((day) => (
                  <div
                    role="cell"
                    key={day}
                    className={cn(
                      "min-h-0 min-w-0 overflow-hidden rounded-md",
                      day !== selectedDay && "hidden sm:block",
                    )}
                  >
                    {cells
                      .filter(
                        (cell) => cell.rowTime === time && cell.day === day,
                      )
                      .map((cell) => {
                        const occupied = cell.slots.length > 0;
                        const overlapping = cell.slots.some((slot, index) =>
                          cell.slots
                            .slice(index + 1)
                            .some(
                              (other) =>
                                Math.max(
                                  minutes(slot.term.od),
                                  minutes(other.term.od),
                                  cell.start,
                                ) <
                                Math.min(
                                  minutes(slot.term.do),
                                  minutes(other.term.do),
                                  cell.end,
                                ),
                            ),
                        );
                        const hasLectures = cell.slots.some(
                          (slot) => slot.type === "P",
                        );
                        const hasExercises = cell.slots.some(
                          (slot) => slot.type === "V",
                        );
                        return (
                          <button
                            key={cell.key}
                            type="button"
                            style={{ height: cell.split ? 48 : 96 }}
                            disabled={!occupied}
                            aria-pressed={pinnedCell === cell.key}
                            aria-label={`${cell.day} ${cell.time}: ${occupied ? cell.slots.map((slot) => `${slot.name}, ${slot.type === "P" ? "predavanje" : "vežbe"}, ${slot.term.od}-${slot.term.do}, ${slot.term.sala}`).join("; ") : "Nema izabranih termina"}`}
                            title={
                              occupied
                                ? cell.slots
                                    .map(
                                      (slot) =>
                                        `${slot.name} (${slot.term.od}-${slot.term.do}, ${slot.term.sala})`,
                                    )
                                    .join("\n")
                                : undefined
                            }
                            onMouseEnter={() => setHoveredCell(cell.key)}
                            onMouseLeave={() => setHoveredCell(null)}
                            onFocus={() => setHoveredCell(cell.key)}
                            onBlur={() => setHoveredCell(null)}
                            onClick={() => {
                              setPinnedCell((current) =>
                                current === cell.key ? null : cell.key,
                              );
                              setHoveredCell(null);
                            }}
                            className={cn(
                              "relative flex w-full flex-col overflow-hidden border border-transparent px-1.5 py-0.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                              !cell.split && "rounded-md",
                              cell.split &&
                                (cell.offset === 0
                                  ? "rounded-t-md"
                                  : "rounded-b-md"),
                              !occupied && "bg-secondary/60",
                              occupied &&
                                hasLectures &&
                                !hasExercises &&
                                "bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:hover:bg-green-900/70",
                              occupied &&
                                hasExercises &&
                                !hasLectures &&
                                "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/50 dark:hover:bg-blue-900/70",
                              hasLectures &&
                                hasExercises &&
                                "bg-accent hover:bg-muted",
                              overlapping &&
                                "border-amber-400 dark:border-amber-500",
                              activeCell?.key === cell.key &&
                                occupied &&
                                "ring-2 ring-foreground/50",
                            )}
                          >
                            {cell.slots.map((slot) => (
                              <span
                                key={`${cell.key}:${slot.key}:${slot.type}:${termKey(slot.term)}`}
                                className="flex min-w-0 shrink-0 items-start gap-1.5"
                              >
                                <span
                                  className={cn(
                                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                                    slot.type === "P"
                                      ? "bg-green-400"
                                      : "bg-blue-400",
                                  )}
                                />
                                <span
                                  className={cn(
                                    "text-xs font-medium leading-[14px]",
                                    cell.split && "line-clamp-1",
                                    overlapping && "pr-3",
                                  )}
                                >
                                  {slot.name}
                                </span>
                              </span>
                            ))}
                            {cell.split && occupied && (
                              <span className="shrink-0 text-[10px] leading-3 text-muted-foreground">
                                {Array.from(
                                  new Set(
                                    cell.slots.map(
                                      (slot) =>
                                        `${slot.term.od}-${slot.term.do}`,
                                    ),
                                  ),
                                ).join(" / ")}
                              </span>
                            )}
                            {overlapping && (
                              <TriangleAlert
                                className="absolute right-0.5 top-0.5 h-3 w-3 text-amber-600 dark:text-amber-400"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        );
                      })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="min-h-24 min-w-0 break-words border-t p-3 sm:p-5"
        aria-live="polite"
        aria-atomic="true"
      >
        {activeCell && activeCell.slots.length > 0 ? (
          <div>
            <p className="mb-3 text-sm font-medium">
              {activeCell.day}, {activeCell.time}
            </p>
            <ul className="space-y-3">
              {activeCell.slots.map((slot) => (
                <li
                  key={`${activeCell.key}:${slot.key}:${slot.type}:${termKey(slot.term)}`}
                >
                  <p className="text-sm font-medium">
                    {slot.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({slot.type === "P" ? "predavanje" : "vežbe"})
                    </span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {slot.term.od}-{slot.term.do}
                    </span>
                    <span className="flex min-w-0 max-w-full items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {slot.term.sala}
                    </span>
                    <span>{slot.term.grupe.join(", ")}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {slots.length
              ? "Izaberi polje u kalendaru da vidiš detalje termina."
              : "Izabrani termini će se pojaviti ovde čim ih dodaš."}
          </p>
        )}
      </div>
    </section>
  );
}
