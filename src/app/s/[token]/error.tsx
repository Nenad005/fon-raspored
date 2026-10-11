"use client";

import { Button } from "~/components/ui/button";

export default function SharedScheduleError({ reset }: { reset: () => void }) {
  return (
    <main
      role="alert"
      className="flex flex-col items-center gap-5 px-5 py-20 text-center"
    >
      <p>Podeljeni raspored trenutno nije moguće učitati.</p>
      <Button onClick={reset}>Pokušaj ponovo</Button>
    </main>
  );
}
