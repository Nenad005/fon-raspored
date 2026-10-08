"use client";

import { useUser } from "@clerk/nextjs";
import { Download } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { clearOtherOfflineSchedule } from "~/lib/offline-schedule";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const PwaContext = createContext<{
  installPrompt: InstallEvent | null;
  standalone: boolean;
  isIOS: boolean;
  isMobile: boolean;
  installError: boolean;
  install: () => Promise<void>;
} | null>(null);

export default function PwaControls({ children }: { children: ReactNode }) {
  const { isLoaded, user } = useUser();
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [offline, setOffline] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [installError, setInstallError] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      clearOtherOfflineSchedule(localStorage, user?.id ?? "guest");
    } catch {
      /* Browser storage is optional. */
    }
  }, [isLoaded, user?.id]);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const updateDisplay = () =>
      setStandalone(
        media.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    const updateNetwork = () => setOffline(!navigator.onLine);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallEvent);
    };
    const installed = () => {
      setInstallPrompt(null);
      setStandalone(true);
    };
    updateDisplay();
    updateNetwork();
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(ios);
    setIsMobile(
      ios ||
        /Android/.test(navigator.userAgent) ||
        Boolean(
          (navigator as Navigator & { userAgentData?: { mobile: boolean } })
            .userAgentData?.mobile,
        ),
    );
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    media.addEventListener("change", updateDisplay);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error: unknown) =>
          console.error("PWA service worker registration failed", error),
        );
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
      media.removeEventListener("change", updateDisplay);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    setInstallError(false);
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setStandalone(true);
    } catch {
      setInstallError(true);
    } finally {
      setInstallPrompt(null);
    }
  }

  return (
    <PwaContext.Provider
      value={{
        installPrompt,
        standalone,
        isIOS,
        isMobile,
        installError,
        install,
      }}
    >
      {children}
      {offline && (
        <div
          role="status"
          className="mb-24 border-b bg-secondary px-5 py-3 text-center text-sm"
        >
          Nema internet veze.{" "}
          <a href="/offline.html" className="underline underline-offset-4">
            Otvori poslednji sačuvani raspored
          </a>
          .
        </div>
      )}
    </PwaContext.Provider>
  );
}

export function PwaInstallButton() {
  const pwa = useContext(PwaContext);
  if (!pwa || !pwa.isMobile || pwa.standalone) return null;
  const { installPrompt, isIOS, installError, install } = pwa;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <Download className="mr-2 h-4 w-4" /> Instaliraj aplikaciju
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>FON raspored na početnom ekranu</DialogTitle>
          <DialogDescription>
            Otvori raspored kao aplikaciju i pogledaj poslednji učitan raspored
            i bez interneta.
          </DialogDescription>
        </DialogHeader>
        {installPrompt && (
          <Button onClick={() => void install()}>
            Instaliraj FON raspored
          </Button>
        )}
        {installError && (
          <p role="alert" className="text-sm">
            Instalacija nije pokrenuta. Koristi meni svog browsera.
          </p>
        )}
        <p className="text-sm">
          {isIOS
            ? "Na iPhone-u ili iPad-u otvori sajt u Safari-ju, dodirni Podeli (Share), zatim Dodaj na početni ekran (Add to Home Screen). Ako se pojavi opcija Open as Web App, uključi je."
            : "Na Androidu otvori meni browsera (⋮), pa Instaliraj aplikaciju ili Dodaj na početni ekran."}
        </p>
        <p className="text-sm text-muted-foreground">
          Prvo otvori svoj raspored dok imaš internet da bi bio dostupan
          offline. Prijava, izmene izbora i osvežavanje podataka zahtevaju
          internet.
        </p>
      </DialogContent>
    </Dialog>
  );
}
