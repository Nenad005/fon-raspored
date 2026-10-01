import type { Metadata } from "next";
import "~/styles/globals.css";
import { ThemeProvider } from "~/components/theme-provider";
import Header from "~/components/header";
import React from "react";
import Footer from "~/components/footer";
import { ClerkProvider } from "@clerk/nextjs";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  metadataBase: new URL("https://fon-ispiti.vercel.app"),
  title: {
    default: "Moj raspored | FON",
    template: "%s | FON Raspored",
  },
  description:
    "Personalizovani raspored predavanja i vežbi za studente Fakulteta organizacionih nauka.",
  icons: {
    icon: "/FON-logo-small.png",
    shortcut: "/FON-logo-small.png",
    apple: "/FON-logo-small.png",
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
      <html lang="sr-Latn">
        <body className={`relative min-h-screen antialiased`}>
          <TRPCReactProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <Header></Header>
              {children}
              <Footer></Footer>
            </ThemeProvider>
          </TRPCReactProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
