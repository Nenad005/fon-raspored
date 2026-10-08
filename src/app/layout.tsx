import type { Metadata, Viewport } from "next";
import "~/styles/globals.css";
import { ThemeProvider } from "~/components/theme-provider";
import Header from "~/components/header";
import React from "react";
import Footer from "~/components/footer";
import { ClerkProvider } from "@clerk/nextjs";
import { TRPCReactProvider } from "~/trpc/react";
import ScheduleUpdateNotice from "~/components/schedule-update-notice";
import PwaControls from "~/components/pwa-controls";

export const viewport: Viewport = { themeColor: "#09090b" };

export const metadata: Metadata = {
  metadataBase: new URL("https://fon-raspored.vercel.app"),
  applicationName: "FON Raspored",
  appleWebApp: {
    capable: true,
    title: "FON Raspored",
    statusBarStyle: "default",
  },
  title: {
    default: "Moj raspored | FON",
    template: "%s | FON Raspored",
  },
  description:
    "Personalizovani raspored predavanja i vežbi za studente Fakulteta organizacionih nauka.",
  icons: {
    icon: "/FON-logo-small.png",
    shortcut: "/FON-logo-small.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    images: [{ url: "/FON-logo-small.png", alt: "FON logo" }],
  },
  twitter: {
    card: "summary",
    images: ["/FON-logo-small.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="sr-Latn" suppressHydrationWarning>
        <body className={`relative min-h-screen antialiased`}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <TRPCReactProvider>
              <Header></Header>
              <ScheduleUpdateNotice />
              {children}
              <Footer></Footer>
              <PwaControls />
            </TRPCReactProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
