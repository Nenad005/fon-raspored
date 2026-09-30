import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Izbor predmeta",
  description: "Izaberi predmete koje slušaš i prilagodi svoj FON raspored.",
};

export default function PredmetiLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
