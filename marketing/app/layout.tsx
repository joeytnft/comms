import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GatherSafe — Secure Communication for Church Security Teams',
  description:
    'Encrypted messaging, push-to-talk voice, panic alerts, and real-time location sharing — built for faith-based security teams.',
  metadataBase: new URL('https://gathersafeapp.com'),
  openGraph: {
    title: 'GatherSafe — Secure Communication for Church Security Teams',
    description:
      'Encrypted messaging, push-to-talk voice, panic alerts, and real-time location sharing — built for faith-based security teams.',
    url: 'https://gathersafeapp.com',
    siteName: 'GatherSafe',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GatherSafe — Secure Communication for Church Security Teams',
    description: 'PTT voice, encrypted messaging, panic alerts, and location sharing for church security teams.',
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-navy-950 text-white antialiased">{children}</body>
    </html>
  );
}
