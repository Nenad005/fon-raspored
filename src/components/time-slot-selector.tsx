"use client"

import React, { useState } from "react"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "~/components/ui/dialog"
import { Badge } from "./ui/badge"
import { Circle, CircleCheck, CircleDot, CircleSlash, MapPin, Users } from "lucide-react"
import { cn } from "~/lib/utils"

const days_short = ["pon", "uto", "sre", "čet", "pet"]
const days = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak"]
const timeSlots = ["08:15", "10:15", "12:15", "14:15", "16:15", "18:15"]

type Availability = "available" | "unavailable" | "selected" | "occupied"

export default function Component({slots_input, termini}) {
  const [slots, setSlots] = useState<Record<string, Availability>>(slots_input)
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  const getSlotStatus = (day: string, time: string): Availability => {
    const key = `${day}-${time}`
    if (selected) {
      if (selected == key) return "selected"
    }
    return slots[key] || "unavailable"
  }

  const toggleSlot = (day: string, time: string) => {
    const key = `${day}-${time}`
    setSelected(key)
  }

  const getButtonColor = (status: Availability) => {
    switch (status) {
      case "available":
        return "bg-green-100 hover:bg-green-200 dark:bg-green-900 dark:hover:bg-green-800"
      case "unavailable":
        return "bg-secondary cursor-not-allowed"
      case "selected":
        return "bg-green-400 hover:bg-green-500 dark:bg-green-600 dark:hover:bg-green-500"
      case "occupied":
        return "bg-red-400 hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400 cursor-not-allowed"
    }
  }

  const handleSave = () => {
    setIsOpen(false)
    // Here you can add logic to save the selected slots
    console.log("Selected slots:", slots)
  }

  const TerminDataByKey = () => {
    const day_time = selected.split("-")
    const dan = day_time[0]
    const od = day_time[1]
    const termin = termini.find((el) => {
      return el.dan == dan && el.od == od
    })

    return <>
      {termin && <div className="flex flex-wrap gap-2 w-full justify-center">
          <Badge variant="secondary" className="felx gap-1 items-center">
            <MapPin size={15}></MapPin>
            {termin.sala}
          </Badge>
          <Badge variant="secondary" className="felx gap-1 items-center">
            <Users size={15}/>
            {termin.grupe.map((grupa, index1) => {
              return <>
                {grupa}
                {index1 != termin.grupe.length-1 && <>,</>}
              </>
            })}
          </Badge>
      </div>}
    </>
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="px-2 py-1 h-auto">Izaberi Termin</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Izaberi termin</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 justify-center [&>*]:transition-all [&>*]:duration-300">
          <Badge variant="secondary" className={cn(getButtonColor("selected"), "flex gap-1 items-center")}>
            <CircleCheck size={15}></CircleCheck> Izabran
          </Badge>
          <Badge variant="secondary" className={cn(getButtonColor("available"), "flex gap-1 items-center")}>
            <Circle size={15}></Circle> Slobodan
          </Badge>
          <Badge variant="secondary" className={cn(getButtonColor("occupied"), "flex gap-1 items-center")}>
            <CircleSlash size={15}></CircleSlash> Zauzet
          </Badge>
        </div>
        <div className="grid grid-cols-[auto,repeat(5,1fr)] gap-1 text-xs">
          <div className="font-bold"></div>
          {days_short.map((day) => (
            <div key={day} className="font-bold text-center">
              {day}
            </div>
          ))}
          {timeSlots.map((time) => (
            <React.Fragment key={time}>
              <div className="self-center">{time}</div>
              {days.map((day) => {
                const status = getSlotStatus(day, time)
                return (
                  <Button
                    key={`${day}-${time}`}
                    className={`w-full h-6 p-0 text-[0.6rem] transition-all duration-300 ${getButtonColor(status)}`}
                    onClick={() => toggleSlot(day, time)}
                    disabled={status === "unavailable"}
                    aria-label={`${day} at ${time}, ${status}`}
                  >
                    <span className="sr-only">
                      {status === "selected" ? "Unselect" : "Select"} {day} at {time}
                    </span>
                  </Button>
                )
              })}
            </React.Fragment>
          ))}
        </div>
        {selected && <TerminDataByKey key={selected}></TerminDataByKey>}
        <DialogFooter>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}