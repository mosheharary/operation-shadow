import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, IBM_Plex_Sans, Special_Elite } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const heading = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-barlow' });
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex' });
const typewriter = Special_Elite({ subsets: ['latin'], weight: '400', variable: '--font-elite' });

export const metadata: Metadata = {
  title: { default: 'Operation Shadow', template: '%s · Operation Shadow' },
  description: 'A tactical stealth game: command a six-person special-operations squad behind enemy lines.',
};

export const viewport: Viewport = {
  themeColor: '#0f1418',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${typewriter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
