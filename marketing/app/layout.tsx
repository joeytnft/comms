import type { Metadata } from 'next';
import './globals.css';
import { ConditionalNav } from '@/components/ConditionalNav';

export const metadata: Metadata = {
  metadataBase: new URL('https://gathersafeapp.com'),
  applicationName: 'GatherSafe',
  title: {
    default: 'GatherSafe: Secure Communication for Church Security Teams',
    template: '%s | GatherSafe',
  },
  description:
    'Encrypted messaging, push-to-talk voice, panic alerts, and real-time location sharing built for faith-based security teams.',
  keywords: [
    'church security app',
    'church security communication',
    'push-to-talk church',
    'encrypted PTT',
    'faith-based security team',
    'church safety app',
    'panic button app',
    'encrypted messaging team',
    'real-time location sharing',
    'GatherSafe',
  ],
  authors: [{ name: 'GatherSafe', url: 'https://gathersafeapp.com' }],
  creator: 'GatherSafe',
  publisher: 'GatherSafe',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  alternates: {
    canonical: 'https://gathersafeapp.com',
  },
  openGraph: {
    title: 'GatherSafe: Secure Communication for Church Security Teams',
    description:
      'Encrypted messaging, push-to-talk voice, panic alerts, and real-time location sharing built for faith-based security teams.',
    url: 'https://gathersafeapp.com',
    siteName: 'GatherSafe',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GatherSafe: Secure Communication for Church Security Teams',
    description:
      'PTT voice, encrypted messaging, panic alerts, and location sharing for church security teams.',
    site: '@GatherSafeApp',
    creator: '@GatherSafeApp',
  },
  icons: {
    icon: '/favicon.ico',
  },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'GatherSafe',
  url: 'https://gathersafeapp.com',
  description:
    'Encrypted messaging, push-to-talk voice, panic alerts, and real-time location sharing built for faith-based security teams.',
  applicationCategory: 'SecurityApplication',
  operatingSystem: 'iOS, Android',
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'USD',
    lowPrice: '8',
    offerCount: '4',
  },
};

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'GatherSafe',
  url: 'https://gathersafeapp.com',
  description:
    'Encrypted PTT voice, panic alerts, real-time location, and Planning Center integration for church security teams.',
  applicationCategory: 'SecurityApplication',
  operatingSystem: 'iOS, Android',
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'USD',
    lowPrice: '8',
    offerCount: '4',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
        />
      </head>
      <body className="bg-navy-950 text-white antialiased">
        <ConditionalNav>{children}</ConditionalNav>
      </body>
    </html>
  );
}
