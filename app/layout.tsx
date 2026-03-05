import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PCOM DO Class of 2026',
  description: 'We made it. Graduation events & celebrations in Philadelphia.',
  openGraph: {
    title: 'PCOM DO Class of 2026',
    description: 'We made it. Graduation events & celebrations in Philadelphia.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
