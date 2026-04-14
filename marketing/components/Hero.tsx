export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          Built for Faith-Based Security Teams
        </div>

        {/* Headline */}
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Keep Your Congregation{' '}
          <span className="text-gradient">Safe and Connected</span>
        </h1>

        {/* Subtext */}
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          Encrypted messaging, push-to-talk voice, panic alerts, and real-time location sharing —
          purpose-built for church and faith-based security teams.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="#pricing"
            className="rounded-xl bg-brand px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 hover:shadow-blue-400/30"
          >
            Get Started — $8/mo
          </a>
          <a
            href="#features"
            className="flex items-center gap-2 rounded-xl border border-white/10 px-8 py-3.5 text-base font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white"
          >
            See Features
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>

        {/* App store badges */}
        <p className="mt-10 text-xs text-slate-500 uppercase tracking-widest">
          Available on iOS &amp; Android
        </p>
        <div className="mt-3 flex items-center justify-center gap-4">
          <StoreBadge label="App Store" icon="apple" />
          <StoreBadge label="Google Play" icon="android" />
        </div>
      </div>
    </section>
  );
}

function StoreBadge({ label, icon }: { label: string; icon: 'apple' | 'android' }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-300">
      {icon === 'apple' ? (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.523 15.341l-4.023-4.023 4.023-4.023c.391-.391.391-1.024 0-1.414-.391-.391-1.024-.391-1.414 0l-4.023 4.023-4.023-4.023c-.391-.391-1.024-.391-1.414 0-.391.391-.391 1.024 0 1.414l4.023 4.023-4.023 4.023c-.391.391-.391 1.024 0 1.414.195.195.451.293.707.293s.512-.098.707-.293l4.023-4.023 4.023 4.023c.195.195.451.293.707.293s.512-.098.707-.293c.391-.39.391-1.023 0-1.414z" />
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" />
        </svg>
      )}
      {label}
    </div>
  );
}
