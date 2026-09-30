import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Izbor termina",
  description:
    "Izaberi termine predavanja i vežbi koji odgovaraju tvom rasporedu.",
};

export default function TerminiLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
