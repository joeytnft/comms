import type { Metadata } from 'next';
import { Pricing } from '@/components/Pricing';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Simple, transparent pricing starting at $8/month. Every plan includes a 14-day free trial with no credit card required. Plans for small churches to multi-campus organizations.',
  keywords: [
    'church security app pricing',
    'GatherSafe plans',
    'PTT app cost',
    'team communication pricing',
    'church safety software price',
    'encrypted messaging plan',
    'security team app subscription',
  ],
  alternates: {
    canonical: 'https://gathersafeapp.com/pricing',
  },
  openGraph: {
    title: 'GatherSafe Pricing – Plans Starting at $8/month',
    description:
      'Simple, transparent pricing starting at $8/month. 14-day free trial, no credit card required. Plans for small churches to multi-campus organizations.',
    url: 'https://gathersafeapp.com/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GatherSafe Pricing – Plans Starting at $8/month',
    description:
      'Simple, transparent pricing starting at $8/month. 14-day free trial, no credit card required.',
  },
};

export default function PricingPage() {
  return (
    <main className="pt-16">
      <Pricing />
    </main>
  );
}
