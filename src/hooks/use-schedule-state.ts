"use client";

import { useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";

export function useScheduleState() {
  const { isLoaded, isSignedIn } = useUser();
  const params = useSearchParams();
  const account = api.account.get.useQuery(undefined, {
    enabled: Boolean(isLoaded && isSignedIn),
    retry: false,
  });
  const year = Number(params.get("year"));
  const name = params.get("group")?.trim();
  const guestGroup =
    Number.isInteger(year) && year >= 1 && year <= 4 && name
      ? { year, name }
      : null;
  return {
    isLoaded,
    isSignedIn,
    account,
    mode: isSignedIn ? (account.data?.preferences.mode ?? "account") : "search",
    group: isSignedIn ? (account.data?.preferences.group ?? null) : guestGroup,
  };
}
