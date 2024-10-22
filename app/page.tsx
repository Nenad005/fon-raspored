"use client"

import { settingsAtom } from "@/state/settingsAtom";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
// import smerovi from '../data/I Godina/po_smeru.json'
// import po_grupi from '../data/I Godina/po_grupi.json'
import raspored from '../data/raspored_nastave.json'
import grupe from '../data/raspored_grupa.json'
import { latinToCyrillic } from "@/lib/utils";
import ErrorMsg from "@/components/error-msg";
import Raspored from "@/components/raspored";
import { CalendarCheck } from "lucide-react";
// import { isOpenAtom } from "@/state/isOpenAtom";

function unicodeCompare(name1, name2) {
  return name1.localeCompare(name2, 'sr', { sensitivity: 'base' });
}

function assignGroup(year, smer, lastName) {
  const smerovi = grupe[year]
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

export default function Home() {
  const [loaded, setLoaded] = useState(false)
  const [settings, setSettings] = useAtom(settingsAtom)

  useEffect(() => {
    setLoaded(true)
    const settingsData = window.localStorage.getItem('SETTINGS')
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
    const result = {
      group: null,
      year: null,
      message: 'Succes !'
    };
  
    if (settings["search_by"] === 'group') {
      if (settings["group_year"] == '') 
        return { ...result, message: 'Error: Godina studia nije izabrana !' };
      
      if (settings["group"] == '')
        return { ...result, message: 'Error: Grupa nije izabrana !' };
      
      return { ...result, group: settings["group"], year: settings["group_year"] };
    }
  
    if (settings["search_by"] === 'lastName') {
      if (settings["year"] == '')
        return { ...result, message: 'Error: Godina studia nije izabrana !' };

      if (settings["class"] == '')
        return { ...result, message: 'Error: Smer nije izabran !' };

      if (settings["lastName"] == '')
        return { ...result, message: 'Error: Prezime nije uneto !' };

      return { ...result, group: assignGroup(settings['year'], settings['class'], latinToCyrillic(settings["lastName"])), year: settings["year"] };
    }
  
    return { ...result, message: 'Error: Nepodrzan nacin pretrage !' };
  }

  return (
    <div className="w-100vw overflow-x-hidden flex flex-col items-center">
      <div className="mt-16 flex flex-col items-center mb-20">
        <h1 className="text-3xl font-medium">RASPORED NASTAVE</h1>
        <h1 className="text-xl mt-2 font-light"><span className="text-blue-300 font-bold">ZIMSKI</span> semestar 2024/25</h1>
        <p className="text-red-400 flex items-center gap-1"><CalendarCheck size={15}></CalendarCheck> vazi od 21. oktobra</p>
      </div>
      {loaded && <>
          {getGroup().group ? 
            <Raspored group={getGroup()} raspored={raspored}></Raspored> : 
            <ErrorMsg message={getGroup().message}></ErrorMsg>
          }
        </>
      }
    </div>
  );
}
