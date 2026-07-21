import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import NavAuth from '@/components/NavAuth';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Monarch × MaxiFi',
  description: 'Bridge Monarch Money actuals with MaxiFi annual budgets',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <header className="bg-navy text-white shadow-sm">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <span className="text-lg font-bold tracking-tight">Monarch</span>
              <span className="text-lg font-light tracking-tight text-blue-200 ml-1">× MaxiFi</span>
            </div>
            <nav className="flex gap-6 text-sm font-medium items-center">
              <Link href="/" className="text-blue-200 hover:text-white transition-colors">
                Report
              </Link>
              <Link href="/settings" className="text-blue-200 hover:text-white transition-colors">
                Settings
              </Link>
              <NavAuth />
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
