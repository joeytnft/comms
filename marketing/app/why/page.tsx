import { WhyDifferent } from '@/components/WhyDifferent';

export const metadata = {
  title: 'Why GatherSafe',
  description: 'What makes GatherSafe different from generic PTT apps and why it matters for your congregation.',
};

export default function WhyPage() {
  return (
    <main className="pt-16">
      <WhyDifferent />
    </main>
  );
}
