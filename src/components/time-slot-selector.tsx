"use client";

import React, { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "~/components/ui/dialog";
import { Badge } from "./ui/badge";
import { Circle, CircleCheck, CircleSlash, MapPin, Users } from "lucide-react";
import { cn } from "~/lib/utils";
import {
  getMultiSessionGroups,
  getSelectionLimit,
  getWeeklySessionCounts,
  intervalKey,
  termKey,
  termGroups,
  type Term,
  type WeeklySessions,
} from "~/lib/schedule-storage";

const days_short = ["pon", "uto", "sre", "čet", "pet"];
const days = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak"];
const timeSlots = ["08:15", "10:15", "12:15", "14:15", "16:15", "18:15"];

type Availability = "available" | "unavailable" | "selected" | "occupied";

export default function Component({
  slots_input,
  termini,
  weeklySessions,
  value = null,
  values,
  onSave,
  onSaveMultiple,
  isOccupied,
  title = "Izaberi termin",
}: {
  slots_input: Record<string, Availability>;
  termini: Term[];
  weeklySessions?: WeeklySessions;
  value?: Term | null;
  values?: Term[];
  onSave?: (term: Term | null) => void;
  onSaveMultiple?: (terms: Term[]) => void;
  isOccupied?: (term: Term) => boolean;
  title?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Term[]>([]);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<Term | null>(null);
  const cellKey = (term: Term) => `${term.dan}-${term.od}`;
  const counts = weeklySessions?.counts ?? getWeeklySessionCounts(termini);
  const groups =
    weeklySessions?.multiSessionGroups ??
    getMultiSessionGroups(termini, counts);
  const multiple = groups.size > 0 && Boolean(onSaveMultiple);
  const selectionLimit = (choices: Term[]) =>
    multiple ? getSelectionLimit(termini, choices, counts) : 1;
  const limit = selectionLimit(selected);
  const eligible = (term: Term) =>
    termGroups(term).some((group) => groups.has(group));
  const initial = multiple
    ? (values ?? (value ? [value] : []))
    : value
      ? [value]
      : [];
  const minutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours! * 60 + minutes!;
  };
  const isSelected = (term: Term) =>
    selected.some((choice) => termKey(choice) === termKey(term));
  const occupied = (term: Term) =>
    (isOccupied?.(term) ?? slots_input[cellKey(term)] === "occupied") ||
    (multiple &&
      eligible(term) &&
      selected.every(eligible) &&
      selected.some(
        (choice) =>
          choice.dan === term.dan &&
          intervalKey(choice) !== intervalKey(term) &&
          term.od < choice.do &&
          choice.od < term.do,
      ));
  const alternatives = termini.filter((term) => cellKey(term) === activeCell);
  const nextSelection = (term: Term) => {
    const retained = selected.filter(
      (choice) => intervalKey(choice) !== intervalKey(term),
    );
    return multiple && eligible(term) && retained.every(eligible)
      ? [...retained, term]
      : [term];
  };
  const blocked = (term: Term) => {
    if (isSelected(term)) return false;
    const next = nextSelection(term);
    return next.length > selectionLimit(next);
  };
  const selectTerm = (term: Term) => {
    if (!blocked(term)) setSelected(nextSelection(term));
  };

  const getSlotStatus = (day: string, time: string): Availability => {
    const key = `${day}-${time}`;
    if (selected.some((term) => cellKey(term) === key)) return "selected";
    const options = termini.filter((term) => cellKey(term) === key);
    if (options.some(occupied)) return "occupied";
    return slots_input[key] || "unavailable";
  };

  const chooseTerm = (term: Term) => {
    if (blocked(term)) return;
    if (isSelected(term)) {
      setSelected(
        selected.filter((choice) => termKey(choice) !== termKey(term)),
      );
      setActiveCell(null);
    } else if (occupied(term)) {
      setPendingSlot(term);
    } else {
      selectTerm(term);
    }
  };

  const toggleSlot = (day: string, time: string) => {
    const key = `${day}-${time}`;
    const options = termini.filter((term) => cellKey(term) === key);
    if (options.every(blocked)) return;
    setActiveCell(key);
    if (options.length === 1) {
      chooseTerm(options[0]!);
    }
  };

  const getButtonColor = (status: Availability) => {
    switch (status) {
      case "available":
        return "bg-green-100 hover:bg-green-200 dark:bg-green-900 dark:hover:bg-green-800";
      case "unavailable":
        return "bg-secondary cursor-not-allowed";
      case "selected":
        return "bg-green-400 hover:bg-green-500 dark:bg-green-600 dark:hover:bg-green-500";
      case "occupied":
        return "bg-red-400 hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400";
    }
  };

  const handleSave = () => {
    if (selected.length > limit) return;
    if (multiple) onSaveMultiple?.(selected);
    else onSave?.(selected[0] ?? null);
    setIsOpen(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) {
          setSelected(initial);
          setActiveCell(initial[0] ? cellKey(initial[0]) : null);
        }
        setPendingSlot(null);
        setIsOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-auto px-2 py-1">
          {initial.length ? "Izmeni termin" : "Izaberi termin"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {multiple && (
          <p className="text-sm text-muted-foreground">
            Za grupe sa više termina možeš izabrati više sesija pojedinačno.{" "}
            Izabrano: {selected.length}/{limit}.
            {selected.length >= limit &&
              " Ukloni neki izabrani termin da dodaš drugi."}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2 [&>*]:transition-all [&>*]:duration-300">
          <Badge
            variant="secondary"
            className={cn(
              getButtonColor("selected"),
              "flex items-center gap-1",
            )}
          >
            <CircleCheck size={15}></CircleCheck> Izabran
          </Badge>
          <Badge
            variant="secondary"
            className={cn(
              getButtonColor("available"),
              "flex items-center gap-1",
            )}
          >
            <Circle size={15}></Circle> Slobodan
          </Badge>
          <Badge
            variant="secondary"
            className={cn(
              getButtonColor("occupied"),
              "flex items-center gap-1",
            )}
          >
            <CircleSlash size={15}></CircleSlash> Zauzet
          </Badge>
        </div>
        <div className="grid grid-cols-[auto,repeat(5,1fr)] gap-1 text-xs">
          <div className="font-bold"></div>
          {days_short.map((day) => (
            <div key={day} className="text-center font-bold">
              {day}
            </div>
          ))}
          {Array.from(
            new Set([...timeSlots, ...termini.map((term) => term.od)]),
          )
            .sort()
            .map((time) => (
              <React.Fragment key={time}>
                <div className="self-center">{time}</div>
                {days.map((day) => {
                  const status = getSlotStatus(day, time);
                  return (
                    <Button
                      key={`${day}-${time}`}
                      className={`h-6 w-full p-0 text-[0.6rem] transition-all duration-300 disabled:opacity-50 ${getButtonColor(status)}`}
                      onClick={() => toggleSlot(day, time)}
                      disabled={
                        status === "unavailable" ||
                        termini
                          .filter((term) => cellKey(term) === `${day}-${time}`)
                          .every(blocked)
                      }
                      aria-pressed={status === "selected"}
                      aria-label={`${day} at ${time}, ${status}`}
                    >
                      <span className="sr-only">
                        {status === "selected" ? "Unselect" : "Select"} {day} at{" "}
                        {time}
                      </span>
                    </Button>
                  );
                })}
              </React.Fragment>
            ))}
        </div>
        {alternatives.length > 1 && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">
              Izaberi salu i grupu za ovaj termin
            </p>
            {alternatives.map((term) => (
              <Button
                key={termKey(term)}
                variant="outline"
                aria-pressed={isSelected(term)}
                disabled={blocked(term)}
                onClick={() => chooseTerm(term)}
                className={cn(
                  "h-auto justify-start whitespace-normal py-2 text-left",
                  isSelected(term) && "border-foreground bg-accent",
                  occupied(term) && "text-red-600 dark:text-red-400",
                )}
              >
                {term.od}-{term.do} · {term.sala} · {term.grupe.join(", ")}
              </Button>
            ))}
          </div>
        )}
        {selected.map((term) => (
          <div
            key={termKey(term)}
            className="flex w-full flex-wrap justify-center gap-2"
          >
            <Badge variant="secondary">
              {term.dan} {term.od}-{term.do} ·{" "}
              {minutes(term.do) - minutes(term.od)} min
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1">
              <MapPin size={15} />
              {term.sala}
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Users size={15} />
              {term.grupe.join(", ")}
            </Badge>
          </div>
        ))}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setSelected([]);
              setActiveCell(null);
            }}
          >
            Bez termina
          </Button>
          <Button
            onClick={handleSave}
            disabled={Boolean(
              selected.length > limit ||
                (activeCell &&
                  !selected.some((term) => cellKey(term) === activeCell)),
            )}
          >
            Sačuvaj
          </Button>
        </DialogFooter>
        <Dialog
          open={pendingSlot !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingSlot(null);
              setActiveCell(selected[0] ? cellKey(selected[0]) : null);
            }
          }}
        >
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Termin se preklapa</DialogTitle>
              <DialogDescription>
                Već imaš izabran termin u ovom vremenskom periodu. Da li želiš
                da izabereš i ovaj termin, iako se preklapaju?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setPendingSlot(null);
                  setActiveCell(selected[0] ? cellKey(selected[0]) : null);
                }}
              >
                Otkaži
              </Button>
              <Button
                onClick={() => {
                  if (pendingSlot) selectTerm(pendingSlot);
                  setPendingSlot(null);
                }}
              >
                Izaberi ipak
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
