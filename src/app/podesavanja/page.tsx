"use client"
import { SignInButton, useUser } from "@clerk/nextjs"
import { api } from "~/trpc/react"
import { useState } from "react"
import { FilePlus, FileUp, ListPlus, Loader, Plus, UtensilsCrossed } from "lucide-react"
import { Button } from "~/components/ui/button"
import Link from "next/link"
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogTrigger, DialogFooter } from "~/components/ui/dialog"
import { Tabs, TabsList, TabsContent, TabsTrigger } from "~/components/ui/tabs"
import { Label } from "~/components/ui/label"
import { Select, SelectItem, SelectTrigger, SelectValue, SelectContent } from "~/components/ui/select"
import predmeti from "~/data/predmeti.json"
import { db } from "~/server/db"


// type Podesavanja = RouterOutputs["settings"]["getUserSettings"]
// type Predmeti = RouterOutputs["settings"]["getUserClasses"]

function UserSettings({user}) {
  const {data : classes, isSuccess: classesSuccess, isLoading: classesLoading} = api.settings.getUserClasses.useQuery({userId: user.id})
  const utils = api.useUtils()
  const {mutate: loadClasses} = api.settings.addClassesFromSmer.useMutation()
  const {mutate: addClass} = api.settings.addClass.useMutation()
  const [year, setYear] = useState("")
  const [customYear, setCustomYear] = useState("")
  const [smer, setSmer] = useState("")
  const [customSmer, setCustomSmer] = useState("")
  const [customClass, setCustomClass] = useState("")
  const [isOpen, setIsOpen] = useState(false)

  function handleLoadClasses(godina, smer) {
    // const test = await api.settings.addClassesFromSmer.useMutation()
    console.log(godina)

    loadClasses({userId: user.id, smer: smer, year: godina})
    utils.settings.getUserClasses.invalidate()
    
    setIsOpen(false)
  }

  function handleAddClass(godina, ime) {
    addClass({userId: user.id, year: godina, ime: ime})
    utils.settings.getUserClasses.invalidate()

    setIsOpen(false)
  }

  return <div className="mt-30 flex flex-col w-full items-center p-5 pt-10">

    <div className="flex justify-start overflow-x-hidden max-w-full w-full md:w-[600px] items-center">
      <p className="text-2xl mr-auto">Tvoji predmeti</p>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" className="h-auto">Dodaj</Button>
        </DialogTrigger>
        <DialogContent className="sm:[max-w-[425px]]">
          <DialogHeader>
            <DialogTitle>Dodaj Predmete</DialogTitle>
          </DialogHeader>
          <Tabs>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="smer">Sa smera</TabsTrigger>
              <TabsTrigger value="custom">Pojedinacno</TabsTrigger>
            </TabsList>
            <TabsContent value="smer">
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="class-year">Godina studija</Label>
                  <Select value={year} onValueChange={(value) => {
                    setSmer("")
                    setYear(value)
                  }}>
                    <SelectTrigger id="class-year">
                      <SelectValue placeholder="Izaberi godinu"></SelectValue>
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
                  <Label htmlFor="class-smer">Smer</Label>
                  <Select value={smer} onValueChange={setSmer} disabled={year==""}>
                    <SelectTrigger id="class-smer">
                      <SelectValue placeholder="Izaberi smer"></SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {year != "" && Object.keys(predmeti[year]).map((smer) => {
                        return <SelectItem value={smer}>{smer}</SelectItem>
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button disabled={smer == ""} className="flex gap-2 items-center" onClick={() => 
                  { handleLoadClasses(year, smer) }}> 
                  <FileUp size={20}></FileUp>Ucitaj
                </Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="custom">
            <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="class-year">Godina studija</Label>
                  <Select value={customYear} onValueChange={(value) => {
                    setCustomSmer("")
                    setCustomYear(value)
                  }}>
                    <SelectTrigger id="class-year">
                      <SelectValue placeholder="Izaberi godinu"></SelectValue>
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
                  <Label htmlFor="class-smer">Smer</Label>
                  <Select value={customSmer} onValueChange={setCustomSmer} disabled={customYear==""}>
                    <SelectTrigger id="class-smer">
                      <SelectValue placeholder="Izaberi smer"></SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {customYear != "" && Object.keys(predmeti[customYear]).map((smer) => {
                        return <SelectItem value={smer}>{smer}</SelectItem>
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="class">Predmet</Label>
                  <Select value={customClass} onValueChange={setCustomClass} disabled={customSmer==""}>
                    <SelectTrigger id="class">
                      <SelectValue placeholder="Izaberi predmet"></SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {customSmer != "" && predmeti[customYear][customSmer].map((predmet) => {
                        return <SelectItem value={predmet}>{predmet}</SelectItem>
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button className="flex gap-2 items-center" disabled={customClass == ""} onClick={() => {
                  handleAddClass(customYear, customClass)}}>
                  <ListPlus size={20}></ListPlus>Dodaj
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
    
    <div>
      {classesLoading ? <LoadingIndicator></LoadingIndicator> : classesSuccess ? 
      <div>
        {classes.map((classObj) => {
          return <div>
            <p>{classObj.ime}</p>
          </div>
        })}
      </div> : <div>GRESKA PRI UCITAVANJU</div>
      }
    </div>
  </div>
}

function LoadingIndicator(props) {
  return <div className="flex flex-col items-center">
    <Loader className="animate-spin duration-1000 w-8 h-8"></Loader>
    <p className="text-card-foreground mt-3">Ucitavanje . . .</p>
  </div>
}

export default function PodesavanjaPage() {
  const {user, isLoaded, isSignedIn} = useUser()
  console.log(user, isLoaded, isSignedIn)

  return <div className="flex flex-col h-full  w-full">
    {!isLoaded ? <div className="mt-60">
      <LoadingIndicator></LoadingIndicator>
    </div> : isSignedIn ? <div>
      <UserSettings user={user}/>
    </div> : <div className="w-full flex flex-col items-center mt-60">
      <p className="text-xl w-[61vw] text-center">Ovoj stranici imaju pristup samo prijavljeni korisnici . . .</p>
      <div className="flex items-center justify-center w-full gap-5 mt-4">
        <SignInButton>
          <Button>Prijava</Button>
        </SignInButton>
        <Link href={"/"}>
          <Button variant="secondary">Pocetna</Button>
        </Link>
      </div>
    </div>

    }
  </div>
}