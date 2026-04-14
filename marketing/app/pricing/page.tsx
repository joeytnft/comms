import { Pricing } from '@/components/Pricing';

export const metadata = {
  title: 'Pricing',
  description: 'Simple, transparent pricing starting at $8/month. Every plan includes a 14-day free trial with no credit card required.',
};

export default function PricingPage() {
  return (
    <main className="pt-16">
      <Pricing />
    </main>
  );
}
