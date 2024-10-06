'use client'

import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import smerovi from '../data/I Godina/po_smeru.json'
import grupe from '../data/I Godina/po_grupi.json'
import { useAtom } from 'jotai'
import { settingsAtom } from '@/state/settingsAtom'

export default function Component() {
  const [isOpen, setIsOpen] = useState(false)
  const [settings, setSettings] = useAtom(settingsAtom)
  const [selectedSearchType, setSelectedSearchType] = useState('lastName')
  const [selectedYear, setSelectedYear] = useState('year1')
  const [selectedGroupYear, setSelectedGroupYear] = useState('year1')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [lastName, setLastName] = useState('')
  // const []

  const handleSaveChanges = () => {
    const settingsDict = {
      search_by: selectedSearchType,
      year: selectedYear,
      class: selectedClass,
      lastName: lastName,
      group_year: selectedGroupYear,
      group: selectedGroup,
    }
    window.localStorage.setItem('SETTINGS', JSON.stringify(settingsDict))
    setSettings(settingsDict)
    setIsOpen(false)
  }

  useEffect(() => {
  }, [selectedSearchType, selectedYear, selectedClass, lastName])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (open) {
        setSelectedSearchType(settings["search_by"])
        setSelectedYear(settings["year"])
        setSelectedClass(settings["class"])
        setLastName(settings["lastName"])
        setSelectedGroupYear(settings["group_year"])
        setSelectedGroup(settings["group"])
      }
      setIsOpen(open)
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className='px-2'>
          <Settings2 strokeWidth={1.5}/>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Podesavanja</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="selection-type">Pretraga po</Label>
            <Select value={selectedSearchType} onValueChange={setSelectedSearchType} disabled={false}>
              <SelectTrigger id="selection-type">
                <SelectValue placeholder="Izaberi tip" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="group">Po Grupi</SelectItem>
                <SelectItem value="lastName">Po Prezimenu</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {selectedSearchType === 'group' ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="group-year-select">Godina Studija</Label>
                <Select value={selectedGroupYear} onValueChange={(value) => {
                    setSelectedGroup('')
                    setSelectedGroupYear(value)
                  }} disabled={true}>
                  <SelectTrigger id="group-year-select">
                    <SelectValue placeholder="Izaberi godinu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year1">I Godina</SelectItem>
                    <SelectItem value="year2">II Godina</SelectItem>
                    <SelectItem value="year3">III Godina</SelectItem>
                    <SelectItem value="year4">IV Godina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='grid gap-2'>
                <Label htmlFor="group-select">Izaberi grupu</Label>
                <Select value={selectedGroup} onValueChange={setSelectedGroup} 
                        disabled={selectedGroupYear == '' ? true : false}>
                  <SelectTrigger id="group-select">
                    <SelectValue placeholder="Izaberi grupu" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(grupe).sort().map((grupa, index) => {
                      return <SelectItem value={grupa} key={index}>{grupa}</SelectItem>
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="year-select">Godina Studija</Label>
                <Select value={selectedYear} onValueChange={(value) => {
                    setSelectedClass('')
                    setSelectedYear(value)
                  }} disabled={true}>
                  <SelectTrigger id="year-select">
                    <SelectValue placeholder="Izaberi godinu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year1">I Godina</SelectItem>
                    <SelectItem value="year2">II Godina</SelectItem>
                    <SelectItem value="year3">III Godina</SelectItem>
                    <SelectItem value="year4">IV Godina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="class-select">Smer</Label>
                <Select value={selectedClass} onValueChange={setSelectedClass} disabled={selectedYear == '' ? true : false}>
                  <SelectTrigger id="class-select">
                    <SelectValue placeholder="Izaberi smer" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(smerovi).map((smer, index) => {
                      return <SelectItem value={smer} key={index}>{smer}</SelectItem>
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="last-name">Prezime</Label>
                <Input id="last-name" value={lastName} onChange={(e) => {
                  setLastName(e.target.value)
                }} placeholder="Unesite vase prezime" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSaveChanges}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}