"use client";

import { Copy, ExternalLink, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import type { WeeklySchedule } from "~/lib/calendar";
import { formatShareDate, shareExpired } from "~/lib/shared-schedule";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

export default function ScheduleShare({
  schedule,
  title,
}: {
  schedule: WeeklySchedule;
  title: string;
}) {
  const create = api.share.create.useMutation();
  const [link, setLink] = useState<{ url: string; expiresAt: Date } | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);

  async function makeLink() {
    setError("");
    setMessage("");
    try {
      const result = await create.mutateAsync({ version: 1, title, schedule });
      setLink({
        url: `${window.location.origin}/s/${result.token}`,
        expiresAt: result.expiresAt,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Link nije moguće napraviti. Pokušaj ponovo.",
      );
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setMessage("Link je kopiran.");
      setError("");
    } catch {
      setError("Kopiranje nije dostupno. Označi link i kopiraj ga ručno.");
    }
  }

  async function shareLink() {
    if (!link) return;
    try {
      await navigator.share({ title: "Podeljeni FON raspored", url: link.url });
      setError("");
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError"))
        setError("Deljenje nije uspelo. Kopiraj link i pošalji ga ručno.");
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        setError("");
        setMessage("");
        if (open && link && shareExpired(link.expiresAt)) setLink(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={!Object.values(schedule).some((events) => events.length)}
        >
          <Share2 className="mr-2 h-4 w-4" /> Podeli raspored
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Podeli nedeljni raspored</DialogTitle>
          <DialogDescription>
            Napravićemo kopiju cele nedelje koja važi 7 dana. Kasnije promene
            neće menjati ovu kopiju. Svako ko ima link može da je vidi, bez
            prijave.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <>
            <Input
              aria-label="Link za podeljeni raspored"
              readOnly
              value={link.url}
              onFocus={(event) => event.currentTarget.select()}
            />
            <p className="text-sm text-muted-foreground">
              Važi do {formatShareDate(link.expiresAt)} (vreme u Beogradu).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void copyLink()}>
                <Copy className="mr-2 h-4 w-4" /> Kopiraj link
              </Button>
              {canShare && (
                <Button variant="outline" onClick={() => void shareLink()}>
                  <Share2 className="mr-2 h-4 w-4" /> Podeli…
                </Button>
              )}
              <Button variant="outline" asChild>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> Otvori pregled
                </a>
              </Button>
            </div>
            <Button
              variant="ghost"
              disabled={create.isPending}
              onClick={() => void makeLink()}
            >
              {create.isPending
                ? "Pravljenje kopije…"
                : "Napravi novi link za trenutni raspored"}
            </Button>
          </>
        ) : (
          <Button disabled={create.isPending} onClick={() => void makeLink()}>
            {create.isPending ? "Pravljenje kopije…" : "Napravi link"}
          </Button>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
