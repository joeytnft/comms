'use client';

import { usePathname } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export function ConditionalNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  return (
    <>
      {!isAdmin && <Nav />}
      {children}
      {!isAdmin && <Footer />}
    </>
  );
}
