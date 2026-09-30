"use client";

import { SignInButton, useClerk, useUser } from "@clerk/nextjs";
import { BookOpen, CalendarClock, LogOut, Settings } from "lucide-react";
import Link from "next/link";

import SettingButton from "./settings-button";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ModeToggle } from "./ui/mode-toggle";

export default function Header() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/90 backdrop-blur-lg">
      <div className="mx-auto flex h-[72px] w-full max-w-3xl items-center gap-2 px-5">
        <Link
          href="/"
          className="mr-auto flex items-center gap-3"
          aria-label="Početna"
        >
          <img
            src="https://oas.fon.bg.ac.rs/wp-content/uploads/2023/04/FON-Logo-Tamni.png.webp"
            alt="FON"
            className="h-11 w-auto dark:brightness-0 dark:invert"
          />
          {/* <span className="hidden text-sm font-semibold sm:block">
            Moj raspored
          </span> */}
        </Link>

        <ModeToggle />
        <SettingButton />

        {isLoaded && isSignedIn && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-1 h-10 w-10 overflow-hidden rounded-full border bg-secondary outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Otvori korisnički meni"
              >
                <img
                  src={user.imageUrl}
                  alt={user.fullName ?? "Profil"}
                  className="h-full w-full object-cover"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 p-2">
              <DropdownMenuLabel className="px-2 py-2">
                <span className="block truncate">
                  {user.fullName ?? "Moj nalog"}
                </span>
                <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                  {user.primaryEmailAddress?.emailAddress}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer gap-2 py-2">
                <Link href="/predmeti">
                  <BookOpen className="h-4 w-4" /> Izbor predmeta
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer gap-2 py-2">
                <Link href="/termini">
                  <CalendarClock className="h-4 w-4" /> Izbor termina
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem disabled className="gap-2 py-2">
                <Settings className="h-4 w-4" /> Podešavanja naloga
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer gap-2 py-2 text-destructive focus:text-destructive"
                onSelect={() => void signOut({ redirectUrl: "/" })}
              >
                <LogOut className="h-4 w-4" /> Odjava
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : isLoaded ? (
          <SignInButton mode="modal">
            <Button className="ml-1">Prijava</Button>
          </SignInButton>
        ) : (
          <div className="ml-1 h-10 w-20 animate-pulse rounded-md bg-secondary" />
        )}
      </div>
    </header>
  );
}
