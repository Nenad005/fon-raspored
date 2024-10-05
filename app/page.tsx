"use client"

import { settingsAtom } from "@/state/settingsAtom";
import { useAtom } from "jotai";
import { useEffect } from "react";

export default function Home() {
  const [settings, setSettings] = useAtom(settingsAtom)

  useEffect(() => {
    let settingsData = window.localStorage.getItem('SETTINGS')
    if (settingsData) {
      setSettings(JSON.parse(settingsData))
      console.log(JSON.parse(settingsData))
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

  return (
    <div className="min-h-screen w-100vw">
      {Object.keys(settings).map((key, index) => {
        return <h2 key={index}>
          {settings[key]}
        </h2>
      })}
      <h1>VASA GRUPA JE {}</h1>
    </div>
  );
}
