"use client";

import { CalendarPlus, Download } from "lucide-react";
import { useState } from "react";
import {
  addCalendarDays,
  calendarToday,
  createCalendar,
  type WeeklySchedule,
} from "~/lib/calendar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

export default function CalendarExport({
  schedule,
  title,
}: {
  schedule: WeeklySchedule;
  title: string;
}) {
  const [startDate, setStartDate] = useState(calendarToday);
  const [endDate, setEndDate] = useState(() =>
    addCalendarDays(calendarToday(), 84),
  );
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  function download() {
    try {
      const content = createCalendar({ schedule, title, startDate, endDate });
      const url = URL.createObjectURL(
        new Blob([content], { type: "text/calendar;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "fon-raspored.ics";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setError("");
      setDownloaded(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Kalendar nije moguće preuzeti.",
      );
      setDownloaded(false);
    }
  }
  return (
    <Dialog
      onOpenChange={() => {
        setError("");
        setDownloaded(false);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="mt-6"
          disabled={!Object.values(schedule).some((events) => events.length)}
        >
          <CalendarPlus className="mr-2 h-4 w-4" /> Dodaj raspored u kalendar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dodaj raspored u kalendar</DialogTitle>
          <DialogDescription>
            {title} — nedeljno ponavljanje, vreme u Beogradu.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="calendar-start">Od datuma</Label>
            <Input
              id="calendar-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendar-end">Do datuma</Label>
            <Input
              id="calendar-end"
              type="date"
              min={startDate}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Ovo je jednokratni uvoz, bez automatske sinhronizacije. Izaberi datume
          nastave; praznici i pauze nisu automatski isključeni. Ako ponavljaš
          uvoz nakon izmene rasporeda, prethodno ukloni stare termine.
        </p>
        <Button onClick={download}>
          <Download className="mr-2 h-4 w-4" /> Preuzmi .ics fajl
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {downloaded && (
          <p role="status" className="text-sm">
            Fajl je pripremljen. Otvori ga ili uvezi u svoj kalendar.
          </p>
        )}
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>iPhone / Apple Calendar:</strong> otvori preuzeti .ics fajl
            i dodaj događaje u kalendar. Ako browser ne ponudi uvoz, koristi
            Apple Calendar na Mac-u.
          </p>
          <p>
            <strong>Google Calendar / Android:</strong> u web verziji Google
            Calendar-a na računaru otvori Podešavanja → Uvoz i izvoz → Uvezi.
            Izaberi .ics fajl; događaji će se pojaviti i na telefonu za isti
            nalog.
          </p>
          <p>
            Zatim možeš da dodaš widget svoje kalendarske aplikacije na početni
            ekran.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
