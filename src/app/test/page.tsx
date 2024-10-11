"use client"
import { api } from "~/trpc/react";

export default function TestPage () {
  const {data} = api.termin.getAll.useQuery()
  return <div className="w-100vw overflow-x-hidden flex flex-col items-center">
    {data.map((termin) => {
      return <p>{JSON.stringify(termin)}</p>
    })}
  </div>
}