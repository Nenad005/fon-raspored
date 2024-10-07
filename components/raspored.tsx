"use client"

import { Calendar, Clock, MapPin, Notebook, Projector, Users } from "lucide-react"
import DaySelect from "./day-select"
import { Badge } from "./ui/badge"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { errorAtom } from "@/state/errorAtom"
import { useAtom } from "jotai"

function danUSrpskom(danEng) {
  const dani = {
      "Monday": "Ponedeljak",
      "Tuesday": "Utorak",
      "Wednesday": "Sreda",
      "Thursday": "Četvrtak",
      "Friday": "Petak",
      "Saturday": "Subota",
      "Sunday": "Nedelja"
  };
  return dani[danEng];
}

function nazivDana() {
  const danas = new Date();
  const danEng = danas.toLocaleDateString('en-US', {weekday: 'long'});
  const danNaSrpskom = danUSrpskom(danEng);

  if (danNaSrpskom === "Subota" || danNaSrpskom === "Nedelja") {
      return "Ponedeljak";
  }
  return danNaSrpskom;
}

function yearName(year) {
  switch (year) {
    case "year1":
      return "G1"
    case "year2":
      return "G2"
    case "year3":
      return "G3"
    case "year4":
      return "G4"
    default:
      return ":/";
  }
}

export default function Raspored({raspored, group}) {
  const [day, setDay] = useState(nazivDana())
  const [error, setError] = useAtom(errorAtom)
  console.log(error ? '' : 'test')
  setError(false)

  return <>
    <div className="flex justify-between gap-3 items-center">
      <div className="flex items-center font-light w-20 gap-2  justify-end">
        <Calendar size={20} strokeWidth={1.5}/>{yearName(group.year)}
      </div>
      <div className="w-3 h-[1px] block bg-foreground"/>
      <div className="flex items-center font-light w-20 gap-2  justify-start">
        <Users size={20} strokeWidth={1.5}/>{group.group}
      </div>
    </div>
    <DaySelect day={day} setDay={setDay} className="my-5"></DaySelect>
    {day in raspored[`${group.group}`] && 
      <div className="flex justify-center px-5 gap-2 items-center">
        <Badge className="bg-green-400 flex gap-1 items-center py-1 hover:bg-green-500 transition-all duration-300">
          <Projector size={15}></Projector>
          <h1>Predavanje</h1>
        </Badge>
        <Badge className="bg-blue-400 flex gap-1 items-center py-1 hover:bg-blue-500 transition-all duration-300">
          <Notebook size={15}></Notebook>
          <h1>Vežba</h1>
        </Badge>
      </div>
    }
    <div className="mb-20 w-full flex flex-col items-center">
      { day in raspored[`${group.group}`] ? raspored[`${group.group}`][`${day}`].map((predavanje, index) => {
        return <div key={index} className="px-5 py-4 w-full md:w-[500px] flex justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className={cn("felx block w-3 h-3 aspect-square rounded-full gap-1 items-center", predavanje.tip == 'P' ? "bg-green-400" : "bg-blue-400")}>
                {/* {predavanje.tip == 'P' ? <Book size={15}/> : <Laptop size={15}/>} */}
              </div>
              <h1 className="text-xl">{predavanje.predmet}</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <Badge variant="secondary" className="flex gap-1 items-center">
                <Clock size={15}/>{`${predavanje.od}-${predavanje.do}`}
              </Badge>
              <Badge variant="secondary" className="felx gap-1 items-center">
                <Users size={15}/>
                {predavanje.grupe.map((grupa, index1) => {
                  return <>
                    {grupa}
                    {index1 != predavanje.grupe.length-1 && <>,</>}
                  </>
                })}
              </Badge>
              <Badge variant="secondary" className="flex gap-1 items-center text-nowrap">
                <MapPin size={15}></MapPin>
                {predavanje.sala}
              </Badge>
            </div>
          </div>
        </div>
      }) : <>
        <div className="mt-10 flex flex-col items-center gap-10 animate-bounce">
          <p className="text-2xl">Danas si slobodan !</p>
          <p className="text-5xl">🍹  🙌  🎉</p>
        </div>
      </>}
    </div>
  </>
}