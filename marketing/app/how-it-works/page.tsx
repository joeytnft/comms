import { HowItWorks } from '@/components/HowItWorks';

export const metadata = {
  title: 'How It Works',
  description: 'Set up GatherSafe for your church security team in under an hour. No IT department required.',
};

export default function HowItWorksPage() {
  return (
    <main className="pt-16">
      <HowItWorks />
    </main>
  );
}
