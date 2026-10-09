import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Adaptive Chess Coach',
  description: 'Play against Stockfish and improve with feedback built around your own games.',
};

export const viewport: Viewport = { themeColor: '#0f1419', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              ♞
            </span>
            Adaptive Chess Coach
          </Link>
          <nav aria-label="Main">
            <Link href="/play">Play</Link>
            <Link href="/analysis">Analysis</Link>
            <Link href="/licenses">Licenses</Link>
          </nav>
        </header>
        <main id="main" className="site-main">
          {children}
        </main>
      </body>
    </html>
  );
}
