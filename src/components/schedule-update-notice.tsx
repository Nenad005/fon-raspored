"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

export default function ScheduleUpdateNotice() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const utils = api.useUtils();
  const account = api.account.get.useQuery(undefined, {
    enabled: Boolean(isLoaded && isSignedIn),
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 60_000,
  });
  const [presentedVersion, setPresentedVersion] = useState<number | null>(null);
  const acknowledge = api.account.acknowledgeSchedule.useMutation({
    onSuccess: (data) => utils.account.get.setData(undefined, data),
    onError: () => {
      void account.refetch();
    },
  });
  const data = account.data;

  useEffect(() => {
    if (
      !isLoaded ||
      !isSignedIn ||
      !data?.scheduleUpdate.pending ||
      presentedVersion === data.scheduleVersion
    )
      return;
    setPresentedVersion(data.scheduleVersion);
    void utils.catalog.get.invalidate();
    void utils.schedule.invalidate();
    router.replace("/termini");
  }, [data, isLoaded, isSignedIn, presentedVersion, router, utils]);

  if (!isLoaded || !isSignedIn || !data?.scheduleUpdate.pending) return null;
  const removed = data.scheduleUpdate.removedTimeslots;
  return (
    <Dialog open>
      <DialogContent
        className="[&>button]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Raspored nastave je ažuriran</DialogTitle>
          <DialogDescription>
            Nepromenjeni termini su sačuvani i već izabrani. Proveri novi
            raspored na stranici za izbor termina i sačuvaj svoje izbore.
          </DialogDescription>
        </DialogHeader>
        {removed.length > 0 ? (
          <div>
            <p className="mb-3 text-sm font-medium">
              Ovi tvoji termini više ne postoje u aktuelnom rasporedu:
            </p>
            <ul className="max-h-60 space-y-3 overflow-y-auto text-sm">
              {removed.map((slot) => (
                <li key={slot.id}>
                  <p className="font-medium">
                    {slot.subjectName} —{" "}
                    {slot.type === "P" ? "predavanje" : "vežbe"}
                  </p>
                  <p className="text-muted-foreground">
                    {slot.dan}, {slot.od}–{slot.do}, sala {slot.sala}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm">
            Svi tvoji sačuvani termini su i dalje dostupni. Ipak, proveri nove
            termine i eventualne izmene grupa.
          </p>
        )}
        {acknowledge.isError && (
          <p role="alert" className="text-sm text-destructive">
            Potvrda nije uspela. Pokušaj ponovo; ako je raspored ponovo
            promenjen, prikazaćemo novu verziju.
          </p>
        )}
        <DialogFooter>
          <Button
            disabled={acknowledge.isPending}
            onClick={() =>
              acknowledge.mutate({
                expectedScheduleVersion: data.scheduleVersion,
              })
            }
          >
            {acknowledge.isPending
              ? "Učitavanje..."
              : "Razumem, proveriću termine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
