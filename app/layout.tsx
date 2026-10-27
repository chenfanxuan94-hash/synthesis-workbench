import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synthesis Workbench",
  description: "Screening, coding and effect extraction for the school-based behavioral health gap synthesis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
