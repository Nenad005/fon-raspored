"use client";

import { useEffect, useState } from "react";
import { BookOpen, CalendarClock, Settings2 } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LAST_NAME_SEARCH_ENABLED } from "~/lib/search";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import raspored from "../data/raspored_nastave.json";
import grupe_import from "../data/raspored_grupa.json";
import { useAtom } from "jotai";
import { settingsAtom } from "~/state/settingsAtom";
import { scheduleModeAtom } from "~/state/scheduleModeAtom";
import { errorAtom } from "~/state/errorAtom";
import { cn } from "~/lib/utils";
import { isOpenAtom } from "~/state/isOpenAtom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

export default function Component() {
  const router = useRouter();
  const { isSignedIn } = useUser();
  const [isOpen, setIsOpen] = useAtom(isOpenAtom);
  const [settings, setSettings] = useAtom(settingsAtom);
  const [selectedSearchType, setSelectedSearchType] = useState("group");
  const [scheduleMode, setScheduleMode] = useAtom(scheduleModeAtom);
  const [selectedYear, setSelectedYear] = useState("year1");
  const [selectedGroupYear, setSelectedGroupYear] = useState("year1");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [lastName, setLastName] = useState("");
  const [error] = useAtom(errorAtom);
  const accountMode = isSignedIn && scheduleMode === "account";
  const searchReady =
    selectedSearchType === "group"
      ? Boolean(selectedGroupYear && selectedGroup)
      : Boolean(selectedYear && selectedClass && lastName.trim());

  const handleSaveChanges = () => {
    if (accountMode) {
      setIsOpen(false);
      router.push("/");
      return;
    }
    if (!searchReady) return;
    const settingsDict = {
      search_by: selectedSearchType,
      year: selectedYear,
      class: selectedClass,
      lastName: lastName.trim(),
      group_year: selectedGroupYear,
      group: selectedGroup,
    };
    window.localStorage.setItem("SETTINGS", JSON.stringify(settingsDict));
    setSettings(settingsDict);
    setScheduleMode("search");
    setIsOpen(false);
    router.push("/");
  };

  useEffect(() => {
    const settingsData = window.localStorage.getItem("SETTINGS");
    if (settingsData) {
      setSettings(JSON.parse(settingsData));
    } else {
      const settingsDict = {
        search_by: "group",
        year: "year1",
        class: "",
        lastName: "",
        group_year: "year1",
        group: "",
      };
      window.localStorage.setItem("SETTINGS", JSON.stringify(settingsDict));
      setSettings(settingsDict);
    }
  }, [setSettings]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedSearchType(
      LAST_NAME_SEARCH_ENABLED ? (settings["search_by"] ?? "group") : "group",
    );
    setSelectedYear(settings["year"] ?? "year1");
    setSelectedClass(settings["class"] ?? "");
    setLastName(settings["lastName"] ?? "");
    setSelectedGroupYear(settings["group_year"] ?? "year1");
    setSelectedGroup(settings["group"] ?? "");
  }, [isOpen, settings]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          aria-label="Podešavanja rasporeda"
          className={cn("px-2", error ? "border-2 border-red-500" : "")}
        >
          <Settings2 strokeWidth={1.5} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {accountMode ? "Podešavanje mog rasporeda" : "Podešavanje pretrage"}
          </DialogTitle>
          <DialogDescription>
            {accountMode
              ? "Prilagodi predmete i termine u svom rasporedu."
              : "Izaberi godinu studija i grupu da prikažeš njen raspored."}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={accountMode ? "account" : "search"}
          onValueChange={(value) =>
            setScheduleMode(value as "account" | "search")
          }
        >
          {isSignedIn && (
            <div className="mb-4 rounded-lg border bg-muted/30 p-3">
              <p id="schedule-view-label" className="mb-2 text-sm font-medium">
                Prikaz na početnoj stranici
              </p>
              <TabsList
                aria-labelledby="schedule-view-label"
                className="grid w-full grid-cols-2"
              >
                <TabsTrigger value="account">Moj raspored</TabsTrigger>
                <TabsTrigger value="search">Raspored grupe</TabsTrigger>
              </TabsList>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Prikaz se menja odmah. Sačuvani predmeti, termini i pretraga
                ostaju nepromenjeni.
              </p>
            </div>
          )}
          {isSignedIn && (
            <TabsContent value="account">
              <div className="py-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    asChild
                    className="justify-start gap-2"
                  >
                    <Link href="/predmeti" onClick={() => setIsOpen(false)}>
                      <BookOpen className="h-4 w-4" /> Izbor predmeta
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    asChild
                    className="justify-start gap-2"
                  >
                    <Link href="/termini" onClick={() => setIsOpen(false)}>
                      <CalendarClock className="h-4 w-4" /> Izbor termina
                    </Link>
                  </Button>
                </div>
              </div>
            </TabsContent>
          )}
          <TabsContent value="search">
            <div className="grid gap-4 py-4">
              {LAST_NAME_SEARCH_ENABLED && (
                <div className="grid gap-2">
                  <Label htmlFor="selection-type">Pretraga po</Label>
                  <Select
                    value={selectedSearchType}
                    onValueChange={setSelectedSearchType}
                    disabled={false}
                  >
                    <SelectTrigger id="selection-type">
                      <SelectValue placeholder="Izaberi tip" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="group">Po grupi</SelectItem>
                      <SelectItem value="lastName">Po prezimenu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedSearchType === "group" ? (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="group-year-select">Godina studija</Label>
                    <Select
                      value={selectedGroupYear}
                      onValueChange={(value) => {
                        setSelectedGroup("");
                        setSelectedGroupYear(value);
                      }}
                      disabled={false}
                    >
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
                  <div className="grid gap-2">
                    <Label htmlFor="group-select">Izaberi grupu</Label>
                    <Select
                      value={selectedGroup}
                      onValueChange={setSelectedGroup}
                      disabled={selectedGroupYear == "" ? true : false}
                    >
                      <SelectTrigger id="group-select">
                        <SelectValue placeholder="Izaberi grupu" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(raspored)
                          .filter((grupa) => {
                            const S =
                              selectedGroupYear == "year1"
                                ? "A"
                                : selectedGroupYear == "year2"
                                  ? "B"
                                  : selectedGroupYear == "year3"
                                    ? "C"
                                    : "D";
                            return grupa.includes(S);
                          })
                          .sort((a, b) => {
                            const aInt = parseInt(a.slice(1, a.length));
                            const bInt = parseInt(b.slice(1, b.length));
                            return aInt - bInt;
                          })
                          .map((grupa, index) => {
                            return (
                              <SelectItem value={grupa} key={index}>
                                {grupa}
                              </SelectItem>
                            );
                          })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="year-select">Godina studija</Label>
                    <Select
                      value={selectedYear}
                      onValueChange={(value) => {
                        setSelectedClass("");
                        setSelectedYear(value);
                      }}
                      disabled={false}
                    >
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
                    <Select
                      value={selectedClass}
                      onValueChange={setSelectedClass}
                      disabled={selectedYear == "" ? true : false}
                    >
                      <SelectTrigger id="class-select">
                        <SelectValue placeholder="Izaberi smer" />
                      </SelectTrigger>
                      <SelectContent>
                        {grupe_import &&
                          Object.keys(grupe_import[selectedYear]).map(
                            (smer, index) => {
                              return (
                                <SelectItem value={smer} key={index}>
                                  {smer}
                                </SelectItem>
                              );
                            },
                          )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="last-name">Prezime</Label>
                    <Input
                      id="last-name"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                      }}
                      placeholder="Unesite vase prezime"
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button
            disabled={!accountMode && !searchReady}
            onClick={handleSaveChanges}
          >
            Prikaži raspored
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
