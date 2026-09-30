import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Podešavanja",
};

export default function PodesavanjaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
