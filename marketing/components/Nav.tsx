'use client';

import { useState } from 'react';

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-navy-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
            <ShieldIcon className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">GatherSafe</span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
          <a href="#features" className="transition-colors hover:text-white">Features</a>
          <a href="#how-it-works" className="transition-colors hover:text-white">How It Works</a>
          <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
        </nav>

        {/* CTA */}
        <a
          href="#pricing"
          className="hidden rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 md:block"
        >
          Get Started
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
            <a href="#features" onClick={() => setOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setOpen(false)}>How It Works</a>
            <a href="#pricing" onClick={() => setOpen(false)}>Pricing</a>
            <a
              href="#pricing"
              className="mt-2 rounded-lg bg-brand px-4 py-2.5 text-center font-medium text-white"
              onClick={() => setOpen(false)}
            >
              Get Started
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
    </svg>
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
