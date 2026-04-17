import { Hero } from '@/components/Hero';
import { WhyDifferent } from '@/components/WhyDifferent';
import { RadioComplement } from '@/components/RadioComplement';
import { CTA } from '@/components/CTA';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <WhyDifferent />
      <RadioComplement />
      <CTA />
    </main>
  );
}
