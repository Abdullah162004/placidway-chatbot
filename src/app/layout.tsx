import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PlacidWay Assistant',
  description: 'Ask about ITC Immunity Therapy Center treatments, packages and prices, answered from PlacidWay pages.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b5c7a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
