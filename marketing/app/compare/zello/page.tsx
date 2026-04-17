import type { Metadata } from 'next';
import { ZelloComparison } from '@/components/ZelloComparison';

export const metadata: Metadata = {
  title: 'GatherSafe vs. Zello – Church Security Communication Comparison',
  description:
    'See why GatherSafe beats Zello for church security: end-to-end encryption, group hierarchy, panic alerts, incident logging, and full data sovereignty — all features Zello lacks.',
  keywords: [
    'GatherSafe vs Zello',
    'Zello alternative for churches',
    'church security PTT app',
    'encrypted PTT app church',
    'Zello church security comparison',
    'push-to-talk church security app',
    'panic button app church',
  ],
  alternates: {
    canonical: 'https://gathersafeapp.com/compare/zello',
  },
  openGraph: {
    title: 'GatherSafe vs. Zello – Why Purpose-Built Wins for Church Security',
    description:
      'End-to-end encryption, command hierarchy, panic alerts, and full self-hosting. See every feature Zello is missing for church security teams.',
    url: 'https://gathersafeapp.com/compare/zello',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GatherSafe vs. Zello – Church Security PTT Comparison',
    description:
      'End-to-end encryption, command hierarchy, panic alerts, and full self-hosting. See every feature Zello is missing.',
  },
};

export default function ZelloComparisonPage() {
  return (
    <main className="pt-16">
      <ZelloComparison />
    </main>
  );
}
