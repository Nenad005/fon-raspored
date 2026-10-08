"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import CalendarExport from "~/components/calendar-export";
import type { WeeklySchedule } from "~/lib/calendar";
import { saveOfflineSchedule } from "~/lib/offline-schedule";

export default function ScheduleTools({
  schedule,
  title,
}: {
  schedule: WeeklySchedule;
  title: string;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  useEffect(() => {
    if (!isLoaded || (isSignedIn && !user)) return;
    try {
      saveOfflineSchedule(localStorage, user?.id ?? "guest", title, schedule);
    } catch {
      /* Storage may be unavailable; online viewing and export still work. */
    }
  }, [isLoaded, isSignedIn, user?.id, title, schedule, user]);
  return <CalendarExport schedule={schedule} title={title} />;
}
