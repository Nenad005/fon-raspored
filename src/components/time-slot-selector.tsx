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

const days_short = ["pon", "uto", "sre", "čet", "pet"];
const days = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak"];
const timeSlots = ["08:15", "10:15", "12:15", "14:15", "16:15", "18:15"];

type Availability = "available" | "unavailable" | "selected" | "occupied";

type Term = {
  dan: string;
  od: string;
  do: string;
  sala: string;
  grupe: string[];
};

export default function Component({
  slots_input,
  termini,
  value = null,
  onSave,
  title = "Izaberi termin",
}: {
  slots_input: Record<string, Availability>;
  termini: Term[];
  value?: Term | null;
  onSave?: (term: Term | null) => void;
  title?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);

  const getSlotStatus = (day: string, time: string): Availability => {
    const key = `${day}-${time}`;
    if (selected) {
      if (selected == key) return "selected";
    }
    return slots_input[key] || "unavailable";
  };

  const toggleSlot = (day: string, time: string) => {
    const key = `${day}-${time}`;
    if (key !== selected && slots_input[key] === "occupied") {
      setPendingSlot(key);
      return;
    }
    setSelected((current) => (current === key ? null : key));
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
    onSave?.(
      termini.find((term) => `${term.dan}-${term.od}` === selected) ?? null,
    );
    setIsOpen(false);
  };

  const TerminDataByKey = () => {
    if (!selected) return null;

    const day_time = selected.split("-");
    const dan = day_time[0];
    const od = day_time[1];
    const termin = termini.find((el) => {
      return el.dan == dan && el.od == od;
    });

    return (
      <>
        {termin && (
          <div className="flex w-full flex-wrap justify-center gap-2">
            <Badge variant="secondary" className="felx items-center gap-1">
              <MapPin size={15}></MapPin>
              {termin.sala}
            </Badge>
            <Badge variant="secondary" className="felx items-center gap-1">
              <Users size={15} />
              {termin.grupe.join(", ")}
            </Badge>
          </div>
        )}
      </>
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) setSelected(value ? `${value.dan}-${value.od}` : null);
        setPendingSlot(null);
        setIsOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-auto px-2 py-1">
          {value ? "Izmeni termin" : "Izaberi termin"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
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
                      className={`h-6 w-full p-0 text-[0.6rem] transition-all duration-300 ${getButtonColor(status)}`}
                      onClick={() => toggleSlot(day, time)}
                      disabled={status === "unavailable"}
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
        {selected && <TerminDataByKey key={selected}></TerminDataByKey>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setSelected(null)}>
            Bez termina
          </Button>
          <Button onClick={handleSave}>Sačuvaj</Button>
        </DialogFooter>
        <Dialog
          open={pendingSlot !== null}
          onOpenChange={(open) => {
            if (!open) setPendingSlot(null);
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
              <Button variant="outline" onClick={() => setPendingSlot(null)}>
                Otkaži
              </Button>
              <Button
                onClick={() => {
                  setSelected(pendingSlot);
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
