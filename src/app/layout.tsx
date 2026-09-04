import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AppProjectNav } from "@/components/project/AppProjectNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "DiffuseCut",
  description: "Local-first AI filmmaking pipeline",
  icons: {
    icon: "/diffusecut-logo.png",
    apple: "/diffusecut-logo.png",
  },
};

const navLinks = [
  { href: "/setup", label: "System Status" },
  { href: "/settings", label: "App Settings" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black antialiased">
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
            <Link href="/" className="flex shrink-0 items-center">
              <Image
                src="/diffusecut-logo.png"
                alt="DiffuseCut"
                width={220}
                height={28}
                priority
                className="h-7 w-auto"
              />
            </Link>
            <nav className="flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-neutral-900 hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <AppProjectNav />
          {children}
        </main>
      </body>
    </html>
  );
}
