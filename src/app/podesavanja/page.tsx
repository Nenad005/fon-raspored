"use client"
import { useUser } from "@clerk/nextjs"
import { api, RouterOutputs } from "~/trpc/react"
import { useEffect, useState } from "react"

type Podesavanja = RouterOutputs["settings"]["getUserSettings"]
type Predmeti = RouterOutputs["settings"]["getUserClasses"]

function UserSettings({user}) {
  const settings = api.settings.getUserSettings.useQuery({userId: user.id})
  const classes = api.settings.getUserClasses.useQuery({userId: user.id})

  return <>
    {settings && JSON.stringify(settings)}
    {classes && JSON.stringify(classes)}
  </>
}

export default function PodesavanjaPage() {
  const {user, isLoaded, isSignedIn} = useUser()

  return <>PODESAVANJA</>
}