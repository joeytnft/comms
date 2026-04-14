import { Features } from '@/components/Features';

export const metadata = {
  title: 'Features',
  description: 'Encrypted messaging, push-to-talk voice, panic alerts, team maps, incident logging, and Planning Center integration.',
};

export default function FeaturesPage() {
  return (
    <main className="pt-16">
      <Features />
    </main>
  );
}
