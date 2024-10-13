'use client'

import { useEffect, useState } from 'react'
import { Settings2, TabletSmartphone } from 'lucide-react'
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "~/components/ui/dialog"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Input } from "~/components/ui/input"
import raspored from '../data/raspored_nastave.json'
import grupe_import from '../data/raspored_grupa.json'
import { useAtom } from 'jotai'
import { settingsAtom } from '~/state/settingsAtom'
import { errorAtom } from '~/state/errorAtom'
import { cn } from '~/lib/utils'
import { isOpenAtom } from '~/state/isOpenAtom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

export default function Component({tab = "search"}) {
  const [isOpen, setIsOpen] = useAtom(isOpenAtom)
  const [settings, setSettings] = useAtom(settingsAtom)
  const [selectedSearchType, setSelectedSearchType] = useState('lastName')
  const [activeTab, setActiveTav] = useState(tab)
  const [selectedYear, setSelectedYear] = useState('year1')
  const [selectedGroupYear, setSelectedGroupYear] = useState('year1')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useAtom(errorAtom)
  // console.log(setError ? '' : '')
  // console.log(selectedYear)
  // console.log(Object.keys(grupe_import[selectedYear]))

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
        <Button variant="outline" className={cn('px-2', error ? 'border-2 border-red-500' : '')}>
          <Settings2 strokeWidth={1.5}/>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Podesavanja</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTav}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="account">Nalog</TabsTrigger>
            <TabsTrigger value="search">Pretraga</TabsTrigger>
          </TabsList>
          <TabsContent value='search'>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="selection-type">Pretraga po</Label>
                <Select value={selectedSearchType} onValueChange={setSelectedSearchType} disabled={false}>
                  <SelectTrigger id="selection-type">
                    <SelectValue placeholder="Izaberi tip" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group">Po grupi</SelectItem>
                    <SelectItem value="lastName">Po prezimenu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {selectedSearchType === 'group' ? (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="group-year-select">Godina studija</Label>
                    <Select value={selectedGroupYear} onValueChange={(value) => {
                        setSelectedGroup('')
                        setSelectedGroupYear(value)
                      }} disabled={false}>
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
                        {Object.keys(raspored).filter((grupa) => {
                          const S = selectedGroupYear == 'year1' ? 'A' 
                          : ( selectedGroupYear == 'year2' ? 'B' 
                          : ( selectedGroupYear == 'year3' ? 'C'
                          : 'D') )
                          return grupa.includes(S)
                        }).sort((a, b) => {
                          const aInt = parseInt(a.slice(1, a.length))
                          const bInt = parseInt(b.slice(1, b.length))
                          return aInt - bInt
                        }).map((grupa, index) => {
                          return <SelectItem value={grupa} key={index}>{grupa}</SelectItem>
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="year-select">Godina studija</Label>
                    <Select value={selectedYear} onValueChange={(value) => {
                        setSelectedClass('')
                        setSelectedYear(value)
                      }} disabled={false}>
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
                        {grupe_import && Object.keys(grupe_import[selectedYear]).map((smer, index) => {
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
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button onClick={handleSaveChanges}>Sačuvaj</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}