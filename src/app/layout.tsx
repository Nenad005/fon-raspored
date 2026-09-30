import type { Metadata } from "next";
import "~/styles/globals.css";
import { ThemeProvider } from "~/components/theme-provider";
import Header from "~/components/header";
import React from "react";
import Footer from "~/components/footer";
import { ClerkProvider } from "@clerk/nextjs";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: {
    default: "Moj raspored | FON",
    template: "%s | FON Raspored",
  },
  description:
    "Personalizovani raspored predavanja i vežbi za studente Fakulteta organizacionih nauka.",
  icons: {
    icon: "/logo.webp",
    shortcut: "/logo.webp",
    apple: "/logo.webp",
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
