import type { Metadata } from 'next';
import { Features } from '@/components/Features';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Encrypted messaging, push-to-talk voice, panic alerts, team maps, incident logging, and Planning Center integration — all in one secure app for church security teams.',
  keywords: [
    'church security features',
    'encrypted PTT app',
    'push-to-talk church security',
    'panic button church',
    'team map location sharing',
    'incident logging app',
    'Planning Center integration',
    'encrypted group messaging',
  ],
  alternates: {
    canonical: 'https://gathersafeapp.com/features',
  },
  openGraph: {
    title: 'GatherSafe Features – Encrypted PTT, Panic Alerts & Team Maps',
    description:
      'Encrypted messaging, push-to-talk voice, panic alerts, team maps, incident logging, and Planning Center integration — all in one secure church security app.',
    url: 'https://gathersafeapp.com/features',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GatherSafe Features – Encrypted PTT, Panic Alerts & Team Maps',
    description:
      'Encrypted messaging, push-to-talk voice, panic alerts, team maps, incident logging, and Planning Center integration.',
  },
};

export default function FeaturesPage() {
  return (
    <main className="pt-16">
      <Features />
    </main>
  );
}
