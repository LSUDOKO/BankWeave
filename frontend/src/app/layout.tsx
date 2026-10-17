import type { Metadata } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import Rail from "@/components/Rail";

const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "BankWeave",
  description: "Many banks, one ring, every claim proven.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen md:flex">
        <Rail />
        <main className="flex-1 min-w-0 px-4 py-5 md:px-8 md:py-7">{children}</main>
      </body>
    </html>
  );
}
