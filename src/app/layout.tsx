import type { Metadata } from 'next';
import { Courier_Prime, Libre_Franklin } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { HydrationMark } from '@/components/hydration-mark';
import { parseTheme } from '@/lib/theme';
import './globals.css';

const franklin = Libre_Franklin({
  subsets: ['latin'],
  variable: '--font-franklin',
  display: 'swap',
});

// The passbook printer: dates and amounts only, never prose.
const courier = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-courier',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Segnabollette',
  icons: { icon: '/brand/logo.svg' },
};

/**
 * The theme comes from the `theme` cookie and lands on <html> before the first paint, so there
 * is no flash and no inline script: `system` lets the CSS follow the OS preference.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get('theme')?.value);
  return (
    <html lang="it" data-theme={theme} className={`${franklin.variable} ${courier.variable}`}>
      <body>
        {children}
        <HydrationMark />
      </body>
    </html>
  );
}
