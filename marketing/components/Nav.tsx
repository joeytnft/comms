'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';

export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { href: '/features', label: 'Features' },
    { href: '/how-it-works', label: 'How It Works' },
    { href: '/compare/zello', label: 'vs. Zello' },
    { href: '/pricing', label: 'Pricing' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-navy-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5">
          <div className="h-8 w-8 overflow-hidden rounded-lg bg-white p-0.5">
            <img
              src="/logo-mark.png"
              alt="GatherSafe"
              className="h-full w-full object-cover object-top"
            />
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">GatherSafe</span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className={`transition-colors hover:text-white ${pathname === href ? 'text-white' : ''}`}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* CTA */}
        <a
          href="/admin/login"
          className="hidden items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:border-white/20 hover:text-white md:flex"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
          Admin Login
        </a>

        {/* Mobile hamburger */}
        <button
          className="text-slate-400 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-white/5 bg-navy-900 px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-4 text-sm text-slate-300">
            {links.map(({ href, label }) => (
              <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>
            ))}
            <a
              href="/admin/login"
              className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 font-medium text-slate-300"
              onClick={() => setOpen(false)}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Admin Login
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
