"use client"
import { api } from "~/trpc/react";
import predmeti from "~/data/predmeti.json"
import termini from "~/data/termini.json"
import TimeSlotSelector from '~/components/time-slot-selector' 
import { space } from "postcss/lib/list";

type Availability = "available" | "unavailable" | "selected"

export default function TestPage () {
  const {data} = api.termin.getAll.useQuery()
  return <div className="w-100vw overflow-x-scroll flex flex-col items-center">
    {/* {data && data.map((termin) => {
      return <p>{JSON.stringify(termin)}</p>
    })} */}
    {predmeti.year1.ISiT.map((predmet) => {
      const slotsp:Record<string, Availability> = {}
      termini.year1[predmet].P.forEach((termin) => {
        const key = `${termin.dan}-${termin.od}`
        slotsp[key] = "available"
      })
      const slotsv:Record<string, Availability> = {}
      termini.year1[predmet].V.forEach((termin) => {
        const key = `${termin.dan}-${termin.od}`
        slotsv[key] = "available"
      })

      return <div className="flex flex-col w-full p-5 md:w-[600px] items-start">
        <h1 className="text-3xl">Predmet : {predmet}</h1>
        <h2>Termini P: </h2>
        <TimeSlotSelector slots_input={slotsp} termini={termini.year1[predmet].P}></TimeSlotSelector>
        {/* {termini.year1[predmet].P.map((termin) => {
          return <p>{JSON.stringify(termin)}</p>
        })} */}
        <h2>Termini V: </h2>
        <TimeSlotSelector slots_input={slotsv} termini={termini.year1[predmet].V}></TimeSlotSelector>
        {/* {termini.year1[predmet].V.map((termin) => {
          return <p>{JSON.stringify(termin, null, 4)}</p>
        })} */}
      </div>
    })}
  </div>
}