"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useScheduleState } from "~/hooks/use-schedule-state";
import { api, type RouterInputs } from "~/trpc/react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export function ModeToggle() {
  const { setTheme } = useTheme();
  const { isLoaded, isSignedIn, account } = useScheduleState();
  const utils = api.useUtils();
  const mutation = api.account.updatePreferences.useMutation({
    onSuccess: (data) => utils.account.get.setData(undefined, data),
  });
  const ready =
    isLoaded &&
    (isSignedIn === false ||
      (isSignedIn === true && Boolean(account.data) && !account.isError));
  const disabled = !ready || mutation.isPending;
  const conflict = mutation.error?.data?.code === "CONFLICT";

  function chooseTheme(
    theme: NonNullable<RouterInputs["account"]["updatePreferences"]["theme"]>,
  ) {
    if (disabled) return;
    if (isSignedIn === false) {
      setTheme(theme);
    } else if (isSignedIn && account.data) {
      mutation.mutate({ expectedRevision: account.data.revision, theme });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-busy={mutation.isPending}
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Promeni temu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={disabled}
            onClick={() => chooseTheme("light")}
          >
            Light
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={disabled}
            onClick={() => chooseTheme("dark")}
          >
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={disabled}
            onClick={() => chooseTheme("system")}
          >
            System
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!ready && !(isLoaded && isSignedIn && account.isError) && (
        <span role="status" className="sr-only">
          Učitavanje teme...
        </span>
      )}
      {isLoaded && isSignedIn && (account.isError || mutation.isError) && (
        <div role="alert" className="flex items-center gap-2 text-sm">
          <span>
            {account.isError ? "Tema nije dostupna." : "Tema nije sačuvana."}
          </span>
          <Button
            variant="outline"
            disabled={
              mutation.isPending ||
              account.isFetching ||
              (!ready && !account.isError)
            }
            onClick={() => {
              if (account.isError || conflict) {
                void account.refetch().then((result) => {
                  if (!result.isError) mutation.reset();
                });
              } else if (mutation.variables?.theme) {
                chooseTheme(mutation.variables.theme);
              }
            }}
          >
            {account.isError || conflict
              ? "Ponovo učitaj temu"
              : "Pokušaj ponovo"}
          </Button>
        </div>
      )}
    </div>
  );
}
