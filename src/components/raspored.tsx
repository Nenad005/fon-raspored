"use client";

import {
  Calendar,
  Clock,
  MapPin,
  Notebook,
  Projector,
  Users,
} from "lucide-react";
import DaySelect from "./day-select";
import { Badge } from "./ui/badge";
import { cn } from "~/lib/utils";
import { useEffect, useState } from "react";
import { errorAtom } from "~/state/errorAtom";
import { useSetAtom } from "jotai";

function danUSrpskom(danEng) {
  const dani = {
    Monday: "Ponedeljak",
    Tuesday: "Utorak",
    Wednesday: "Sreda",
    Thursday: "Četvrtak",
    Friday: "Petak",
    Saturday: "Subota",
    Sunday: "Nedelja",
  };
  return dani[danEng];
}

function nazivDana() {
  const danas = new Date();
  const danEng = danas.toLocaleDateString("en-US", { weekday: "long" });
  const danNaSrpskom = danUSrpskom(danEng);

  if (danNaSrpskom === "Subota" || danNaSrpskom === "Nedelja") {
    return "Ponedeljak";
  }
  return danNaSrpskom;
}

function yearName(year) {
  switch (year) {
    case "year1":
      return "G1";
    case "year2":
      return "G2";
    case "year3":
      return "G3";
    case "year4":
      return "G4";
    default:
      return ":/";
  }
}

export default function Raspored({ raspored, group, label = "" }) {
  const [day, setDay] = useState(nazivDana());
  const setError = useSetAtom(errorAtom);
  useEffect(() => setError(false), [setError]);
  const dailySchedule = raspored[group.group]?.[day] ?? [];

  return (
    <>
      {label ? (
        <div className="flex items-center gap-2 font-light">
          <Calendar size={20} strokeWidth={1.5} />
          {label}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex w-20 items-center justify-end gap-2 font-light">
            <Calendar size={20} strokeWidth={1.5} />
            {yearName(group.year)}
          </div>
          <div className="block h-[1px] w-3 bg-foreground" />
          <div className="flex w-20 items-center justify-start gap-2 font-light">
            <Users size={20} strokeWidth={1.5} />
            {group.group}
          </div>
        </div>
      )}
      <DaySelect day={day} setDay={setDay} className="my-5"></DaySelect>
      {dailySchedule.length > 0 && (
        <div className="flex items-center justify-center gap-2 px-5">
          <Badge className="flex items-center gap-1 bg-green-400 py-1 transition-all duration-300 hover:bg-green-500">
            <Projector size={15}></Projector>
            <h1>Predavanje</h1>
          </Badge>
          <Badge className="flex items-center gap-1 bg-blue-400 py-1 transition-all duration-300 hover:bg-blue-500">
            <Notebook size={15}></Notebook>
            <h1>Vežba</h1>
          </Badge>
        </div>
      )}
      <div className="mb-20 flex w-full flex-col items-center">
        {dailySchedule.length > 0 ? (
          dailySchedule.map((predavanje, index) => {
            return (
              <div
                key={index}
                className="flex w-full justify-between px-5 py-4 md:w-[500px]"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "felx block aspect-square h-3 w-3 items-center gap-1 rounded-full",
                        predavanje.tip == "P" ? "bg-green-400" : "bg-blue-400",
                      )}
                    >
                      {/* {predavanje.tip == 'P' ? <Book size={15}/> : <Laptop size={15}/>} */}
                    </div>
                    <h1 className="text-xl">{predavanje.predmet}</h1>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      <Clock size={15} />
                      {`${predavanje.od}-${predavanje.do}`}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="felx items-center gap-1"
                    >
                      <Users size={15} />
                      {predavanje.grupe.join(",")}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1 text-nowrap"
                    >
                      <MapPin size={15}></MapPin>
                      {predavanje.sala}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <>
            <div className="mt-10 flex animate-bounce flex-col items-center gap-10">
              <p className="text-2xl">Danas si slobodan !</p>
              <p className="text-5xl">🍹 🙌 🎉</p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
