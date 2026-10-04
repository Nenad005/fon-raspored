"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";
import { useScheduleState } from "~/hooks/use-schedule-state";

function AccountThemeSync() {
  const { isLoaded, isSignedIn, account } = useScheduleState();
  const { setTheme } = useTheme();
  const theme =
    isLoaded && isSignedIn && !account.isError
      ? (account.data?.preferences.theme ?? "system")
      : "system";

  React.useEffect(() => {
    // Each identity mounts fresh; next-themes' cache is not account authority.
    setTheme(theme);
  }, [theme, setTheme]);

  return null;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <AccountThemeSync />
      {children}
    </NextThemesProvider>
  );
}
