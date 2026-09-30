import { atomWithStorage } from "jotai/utils";

export const scheduleModeAtom = atomWithStorage<"account" | "search">(
  "SCHEDULE_MODE",
  "account",
);
