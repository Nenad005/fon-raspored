"use client"

import { settingsAtom } from "@/state/settingsAtom";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import smerovi from '../data/I Godina/po_smeru.json'
import po_grupi from '../data/I Godina/po_grupi.json'
import { cn, latinToCyrillic } from "@/lib/utils";
import DaySelect from "@/components/day-select";
import { Separator } from "@/components/ui/separator";
import { Book, Calendar, Clock, Laptop, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function unicodeCompare(name1, name2) {
  return name1.localeCompare(name2, 'sr', { sensitivity: 'base' });
}

function assignGroup(smer, lastName) {
  // console.log(smer, lastName)
  if (!smerovi[smer]) {
    console.error(`Error: SMER '${smer}' not found.`);
    return null;
  }

  for (let index = 0; index < smerovi[smer].length; index++) {
    const grupaData = smerovi[smer][index];
    if (index === smerovi[smer].length - 1) {
      return grupaData.grupa;
    }
    if (unicodeCompare(grupaData.od, lastName) <= 0 && unicodeCompare(lastName, grupaData.do) <= 0) {
      return grupaData.grupa;
    }
  }

  return "No group found for the given last name.";
}

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

export default function Home() {
  const [loaded, setLoaded] = useState(false)
  const [settings, setSettings] = useAtom(settingsAtom)
  const [day, setDay] = useState(nazivDana())

  useEffect(() => {
    setLoaded(true)
    let settingsData = window.localStorage.getItem('SETTINGS')
    if (settingsData) {
      setSettings(JSON.parse(settingsData))
      // console.log(JSON.parse(settingsData))
    } else {
      const settingsDict = {
        search_by: 'group',
        year: 'year1',
        class: '',
        lastName: '',
        group_year: 'year1',
        group: ''
      }
      window.localStorage.setItem('SETTINGS', JSON.stringify(settingsDict))
      setSettings(settingsDict)
    }
  }, [])

  function getGroup() {
    let result = {
      group: null,
      year: null,
      message: 'Success!'
    };
  
    if (settings["search_by"] === 'group') {
      if (settings["group_year"] == '') 
        return { ...result, message: 'Error: Godina studia nije izabrana.' };
      
      if (settings["group"] == '')
        return { ...result, message: 'Error: Grupa nije izabrana.' };
      
      return { ...result, group: settings["group"], year: settings["group_year"] };
    }
  
    if (settings["search_by"] === 'lastName') {
      if (settings["year"] == '')
        return { ...result, message: 'Error: Godina studia nije izabrana.' };

      if (settings["class"] == '')
        return { ...result, message: 'Error: Smer nije izabran.' };

      if (settings["lastName"] == '')
        return { ...result, message: 'Error: Prezime nije uneto.' };

      return { ...result, group: assignGroup(settings['class'], latinToCyrillic(settings["lastName"])), year: settings["year"] };
    }
  
    return { ...result, message: 'Error: Unsupported search_by value.' };
  }

  return (
    <div className="w-100vw overflow-x-hidden flex flex-col items-center">
      <div className="mt-16 flex flex-col items-center mb-20">
        <h1 className="text-3xl font-medium">RASPORED NASTAVE</h1>
        <h1 className="text-xl mt-2 font-light"><span className="text-blue-300 font-bold">ZIMSKI</span> semestar 2024/25</h1>
        {/* <h1>{`${loaded}`}</h1> */}
      </div>
      {loaded && <>
          {getGroup().group ? <>
            <div className="flex justify-between gap-3 items-center">
              <div className="flex items-center font-light w-20 gap-2  justify-end">
                <Calendar size={20} strokeWidth={1.5}/>{yearName(getGroup().year)}
              </div>
              <div className="w-3 h-[1px] block bg-foreground"/>
              <div className="flex items-center font-light w-20 gap-2  justify-start">
                <Users size={20} strokeWidth={1.5}/>{getGroup().group}
              </div>
            </div>
            {/* <h1 className="font-bold">{`${getGroup().group}|${getGroup().year}`}</h1> */}
            <DaySelect day={day} setDay={setDay} className="my-5"></DaySelect>
            <div className="mb-20 w-full">
              {po_grupi[`${getGroup().group}`][`${day}`].map((predavanje, index) => {
                return <div key={index} className="px-5 py-4 w-full flex justify-between">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className={cn("felx block w-3 h-3 aspect-square rounded-full gap-1 items-center", predavanje.tip == 'P' ? "bg-green-400" : "bg-blue-400")}>
                        {/* {predavanje.tip == 'P' ? <Book size={15}/> : <Laptop size={15}/>} */}
                        {/* {predavanje.tip == 'P' ? 'Predavanje' : 'Vežba'} */}
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
              })}
            </div>
          </> : <p>{getGroup()['message']}</p>}
        </>
      }
    </div>
  );
}
