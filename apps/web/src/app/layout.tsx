import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = {
  title: "FinCite — Financial clarity, with sources",
  description: "Explore consumer finance questions with source-linked answers and clear evidence limits. FinCite frontend preview.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
