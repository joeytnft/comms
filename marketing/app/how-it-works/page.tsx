import type { Metadata } from 'next';
import { HowItWorks } from '@/components/HowItWorks';

export const metadata: Metadata = {
  title: 'How It Works',
  description:
    'Set up GatherSafe for your church security team in under an hour. No IT department required. Simple onboarding from account creation to your first secure PTT broadcast.',
  keywords: [
    'church security app setup',
    'how GatherSafe works',
    'security team onboarding',
    'church safety app setup',
    'encrypted PTT setup',
    'church communication app guide',
  ],
  alternates: {
    canonical: 'https://gathersafeapp.com/how-it-works',
  },
  openGraph: {
    title: 'How GatherSafe Works – Simple Setup for Church Security Teams',
    description:
      'Set up GatherSafe for your church security team in under an hour. No IT department required. Simple onboarding to secure PTT broadcasts.',
    url: 'https://gathersafeapp.com/how-it-works',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How GatherSafe Works – Simple Setup for Church Security Teams',
    description:
      'Set up GatherSafe for your church security team in under an hour. No IT department required.',
  },
};

export default function HowItWorksPage() {
  return (
    <main className="pt-16">
      <HowItWorks />
    </main>
  );
}
