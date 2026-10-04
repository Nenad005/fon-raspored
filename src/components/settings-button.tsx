"use client";

import { useEffect, useState } from "react";
import { BookOpen, CalendarClock, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
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
import { errorAtom } from "~/state/errorAtom";
import { isOpenAtom } from "~/state/isOpenAtom";
import { cn } from "~/lib/utils";
import { useScheduleState } from "~/hooks/use-schedule-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { api } from "~/trpc/react";

export default function Component() {
  const router = useRouter();
  const { isLoaded, isSignedIn, account, mode, group } = useScheduleState();
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useAtom(isOpenAtom);
  const [error] = useAtom(errorAtom);
  const [hydrated, setHydrated] = useState(false);
  const [draftMode, setDraftMode] = useState(
    isLoaded && isSignedIn ? mode : "search",
  );
  const [revision, setRevision] = useState<number>();
  const [selectedGroupYear, setSelectedGroupYear] = useState("year1");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [closeAfterRetry, setCloseAfterRetry] = useState(false);
  const [reloadRevision, setReloadRevision] = useState<number>();
  const mutation = api.account.updatePreferences.useMutation({
    onSuccess: (data) => utils.account.get.setData(undefined, data),
  });
  const conflict = mutation.isError && mutation.error.data?.code === "CONFLICT";
  const busy = mutation.isPending || account.isFetching;
  const accountReady = Boolean(
    isLoaded &&
      isSignedIn &&
      account.data &&
      !account.isError &&
      hydrated &&
      revision !== undefined,
  );
  const ready =
    isLoaded && (isSignedIn ? accountReady : isSignedIn === false && hydrated);
  const accountMode = Boolean(
    isLoaded && isSignedIn && draftMode === "account",
  );
  const groupsQuery = api.schedule.groups.useQuery(
    { year: Number(selectedGroupYear.slice(4)) },
    {
      enabled: isOpen && !accountMode,
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  );
  const groups =
    !groupsQuery.isError && !groupsQuery.isPlaceholderData
      ? groupsQuery.data
      : undefined;
  const selected = groups?.find((item) => item.name === selectedGroup);
  const staleGroup =
    groups !== undefined && Boolean(selectedGroup) && !selected;
  const canSave =
    ready && !busy && !conflict && (accountMode || Boolean(selected));

  useEffect(() => {
    // Wait for the query observer to expose the refetched state, not its old cache.
    if (
      isOpen &&
      isLoaded &&
      isSignedIn &&
      reloadRevision !== undefined &&
      !account.isError &&
      account.data?.revision === reloadRevision
    ) {
      mutation.reset();
      setHydrated(false);
      setReloadRevision(undefined);
    }
  }, [
    isOpen,
    isLoaded,
    isSignedIn,
    reloadRevision,
    account.data,
    account.isError,
    mutation,
  ]);

  async function reloadPreferences() {
    if (!isLoaded || !isSignedIn || busy) return;
    try {
      const result = await account.refetch();
      if (result.isSuccess && result.data)
        setReloadRevision(result.data.revision);
    } catch {
      // Keep the conflict and draft if the reload fails.
    }
  }

  useEffect(() => {
    if (!isOpen) {
      setHydrated(false);
      return;
    }
    if (hydrated || !isLoaded || isSignedIn === undefined) return;
    if (isSignedIn && (!account.data || account.isError)) return;
    setHydrated(true);
    setDraftMode(isSignedIn ? mode : "search");
    setRevision(isSignedIn ? account.data?.revision : undefined);
    setSelectedGroupYear(`year${group?.year ?? 1}`);
    setSelectedGroup(group?.name ?? "");
  }, [
    isOpen,
    isLoaded,
    isSignedIn,
    account.data,
    account.isError,
    mode,
    group,
    hydrated,
  ]);

  function finish() {
    setIsOpen(false);
    router.push("/");
  }

  function updatePreferences(
    input: Parameters<typeof mutation.mutate>[0],
    close: boolean,
  ) {
    setCloseAfterRetry(close);
    mutation.mutate(input, {
      onSuccess: (data) => {
        // Advance only our own writes, without replacing an unsaved group draft.
        setRevision(data.revision);
        setDraftMode(data.preferences.mode);
        if (close) finish();
      },
    });
  }

  function handleSaveChanges() {
    if (!canSave) return;
    if (accountMode) {
      finish();
    } else if (isSignedIn && revision !== undefined && selected) {
      updatePreferences(
        { expectedRevision: revision, mode: "search", groupId: selected.id },
        true,
      );
    } else if (isSignedIn === false && selected) {
      setIsOpen(false);
      router.push(
        `/?year=${Number(selectedGroupYear.slice(4))}&group=${encodeURIComponent(selected.name)}`,
      );
    }
  }

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
        {!isLoaded ||
        isSignedIn === undefined ||
        (isSignedIn && !account.data && !account.isError) ? (
          <p role="status" className="text-sm">
            Učitavanje podešavanja...
          </p>
        ) : null}
        {isLoaded && isSignedIn && account.isError && (
          <div role="alert" className="grid gap-2 text-sm">
            <p>Podešavanja naloga nije moguće učitati. Pokušaj ponovo.</p>
            <Button
              variant="outline"
              onClick={() => void account.refetch()}
              disabled={account.isFetching}
            >
              Pokušaj ponovo
            </Button>
          </div>
        )}
        {mutation.isError && (
          <div role="alert" className="grid gap-2 text-sm">
            <p>
              {conflict
                ? "Podešavanja naloga su promenjena. Učitaj najnovija podešavanja i odbaci nesačuvane izmene pre ponovnog čuvanja."
                : "Podešavanja nije moguće sačuvati. Pokušaj ponovo."}
            </p>
            <Button
              variant="outline"
              disabled={busy || (conflict ? !isLoaded || !isSignedIn : !ready)}
              onClick={() => {
                if (conflict) return reloadPreferences();
                if (ready && !busy && mutation.variables)
                  updatePreferences(mutation.variables, closeAfterRetry);
              }}
            >
              {conflict ? "Učitaj najnovija podešavanja" : "Pokušaj ponovo"}
            </Button>
          </div>
        )}
        <Tabs
          value={accountMode ? "account" : "search"}
          onValueChange={(value) => {
            if (
              !accountReady ||
              busy ||
              conflict ||
              revision === undefined ||
              (value !== "account" && value !== "search") ||
              value === draftMode
            )
              return;
            updatePreferences(
              { expectedRevision: revision, mode: value },
              false,
            );
          }}
        >
          {isLoaded && isSignedIn && (
            <div className="mb-4 rounded-lg border bg-muted/30 p-3">
              <p id="schedule-view-label" className="mb-2 text-sm font-medium">
                Prikaz na početnoj stranici
              </p>
              <TabsList
                aria-labelledby="schedule-view-label"
                className="grid w-full grid-cols-2"
              >
                <TabsTrigger
                  value="account"
                  disabled={!accountReady || busy || conflict}
                >
                  Moj raspored
                </TabsTrigger>
                <TabsTrigger
                  value="search"
                  disabled={!accountReady || busy || conflict}
                >
                  Raspored grupe
                </TabsTrigger>
              </TabsList>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Prikaz se menja odmah. Sačuvani predmeti, termini i pretraga
                ostaju nepromenjeni.
              </p>
            </div>
          )}
          {isLoaded && isSignedIn && (
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
              <div className="grid gap-2">
                <Label htmlFor="group-year-select">Godina studija</Label>
                <Select
                  value={selectedGroupYear}
                  onValueChange={(value) => {
                    setSelectedGroup("");
                    setSelectedGroupYear(value);
                  }}
                  disabled={!ready || busy}
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
                  value={selected ? selectedGroup : ""}
                  onValueChange={setSelectedGroup}
                  disabled={!ready || busy || !groups?.length}
                >
                  <SelectTrigger id="group-select">
                    <SelectValue
                      placeholder={
                        !groups && !groupsQuery.isError
                          ? "Učitavanje grupa..."
                          : "Izaberi grupu"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {groups?.map((item) => (
                      <SelectItem value={item.name} key={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {groupsQuery.isError && (
                  <div role="alert" className="grid gap-2 text-sm">
                    <p>
                      Grupe nije moguće učitati. Proveri godinu studija i
                      pokušaj ponovo.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => void groupsQuery.refetch()}
                      disabled={groupsQuery.isFetching}
                    >
                      Pokušaj ponovo
                    </Button>
                  </div>
                )}
                {groups?.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nema dostupnih grupa za ovu godinu. Izaberi drugu godinu
                    studija.
                  </p>
                )}
                {staleGroup && (
                  <p role="alert" className="text-sm">
                    Sačuvana grupa nije dostupna za ovu godinu. Izaberi novu
                    grupu ili promeni godinu studija.
                  </p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button disabled={!canSave} onClick={handleSaveChanges}>
            Prikaži raspored
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
