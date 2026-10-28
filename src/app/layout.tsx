import type { Metadata } from "next";
import { JetBrains_Mono, Silkscreen, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { NavProgress } from "@/components/NavProgress";
import { TetrisFloor } from "@/components/TetrisFloor";
import "./globals.css";

const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });
const pixel = Silkscreen({ variable: "--font-silkscreen", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "OAuth Ready — know the path before you build",
  description: "Evidence-backed guides for creating and getting approval for provider OAuth apps, plus a live research agent for any app.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${grotesk.variable} ${mono.variable} ${pixel.variable} min-h-screen`}>
        <Suspense>
          <NavProgress />
        </Suspense>
        <header className="no-print sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
          <nav data-dim className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
            <Link href="/" className="brand flex items-center gap-2 font-pixel text-sm tracking-tight">
              <span aria-hidden className="logo-mark grid grid-cols-2 gap-px">
                <span className="h-1.5 w-1.5 bg-accent" />
                <span className="h-1.5 w-1.5" />
                <span className="h-1.5 w-1.5 bg-field" />
                <span className="h-1.5 w-1.5 bg-accent" />
              </span>
              oauth<span className="text-accent">ready</span>
            </Link>
            <div className="ml-auto flex items-center gap-4 whitespace-nowrap text-xs text-muted sm:gap-5 sm:text-sm">
              <Link href="/#library" className="hover:text-text">Library</Link>
              <Link href="/evidence" className="hover:text-text">
                <span className="sm:hidden">Evidence</span>
                <span className="hidden sm:inline">Verification log</span>
              </Link>
              <Link href="/how" className="hover:text-text">
                <span className="sm:hidden">How</span>
                <span className="hidden sm:inline">How it works</span>
              </Link>
            </div>
          </nav>
        </header>
        {children}
        <footer className="no-print mt-10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 pb-6 sm:px-6">
            <p className="max-w-md font-mono text-xs leading-relaxed text-faint">
              Guides are research aids, not legal advice. Provider rules change, so every claim shows its evidence and date.
            </p>
            <div className="flex gap-4 font-mono text-xs text-muted">
              <Link href="/#library" className="hover:text-accent">library</Link>
              <Link href="/evidence" className="hover:text-accent">verification log</Link>
              <Link href="/how" className="hover:text-accent">how it works</Link>
            </div>
          </div>
          <TetrisFloor />
        </footer>
      </body>
    </html>
  );
}
