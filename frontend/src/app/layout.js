import "./globals.css";
import Link from "next/link";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata = {
  title: "Manufacture AI",
  description: "From idea to factory-ready faster than humans.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${monoFont.variable}`}>
        <div className="min-h-screen bg-grid">
          <header className="sticky top-0 z-50 border-b border-line bg-backdrop/85 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
              <Link href="/dashboard" className="tracking-tight text-xl font-semibold text-ink">
                Manufacture AI
              </Link>
              <nav className="flex items-center gap-3 text-sm text-muted">
                <Link href="/dashboard" className="hover:text-ink transition-colors">Dashboard</Link>
                <Link href="/auth" className="hover:text-ink transition-colors">Auth</Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8 animate-in">{children}</main>
        </div>
      </body>
    </html>
  );
}
