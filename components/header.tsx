"use client"

import { SignedIn, SignInButton, UserButton, useUser } from "@clerk/nextjs";
import SettingButton from "./settings-button";
import { ModeToggle } from "./ui/mode-toggle";
import { SignedOut } from "@clerk/clerk-react";
import { Button } from "./ui/button";
import { dark } from "@clerk/themes"

export default function Header() {
  const user = useUser()

  return <>
    <header className="w-full flex justify-center border-b">
      <div className="flex justify-start w-full md:w-[760px] items-center px-5 py-2 gap-3">
        <img  src="https://oas.fon.bg.ac.rs/wp-content/uploads/2023/04/FON-Logo-Tamni.png.webp"
              className="h-16 aspect-auto dark:brightness-0 dark:invert mr-auto"></img>
        <ModeToggle></ModeToggle>
        <SettingButton></SettingButton>
        {user && user.isSignedIn ? 
            <UserButton appearance={
              {
                baseTheme: dark,
                elements: {
                  avatarBox: {
                    width: 35,
                    height: 35
                  }
                }
              }
            }/> : 
          <SignInButton>
            <Button>Prijava</Button>
          </SignInButton>
        }
      </div>
    </header>
  </>
}