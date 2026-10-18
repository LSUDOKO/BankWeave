import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";

// Inter with its optical-size axis: large sizes switch to the Display cut
const sans = Inter({ subsets: ["latin"], variable: "--font-inter", axes: ["opsz"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "BankWeave",
  description: "Cross-bank money-laundering investigations on FalkorDB, with every claim proven.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <TopNav />
        <main className="mx-auto w-full max-w-[1360px] px-4 pb-16 pt-8 md:px-8">{children}</main>
      </body>
    </html>
  );
}
