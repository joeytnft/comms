export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
      {/* Dual-tone glow */}
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Purpose-Built for Faith-Based Security Teams
        </div>

        {/* Headline */}
        <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          The Security Communication App{' '}
          <span className="text-gradient">Churches Actually Need</span>
        </h1>

        {/* Subtext */}
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
          Encrypted PTT voice, panic alerts, real-time location, and Planning Center integration.
          One app designed from the ground up for how church security teams actually operate.
        </p>

        {/* Stats */}
        <div className="mt-10 flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-12">
          {[
            { value: 'E2E', label: 'Signal Protocol Encrypted' },
            { value: '< 1s', label: 'PTT Latency' },
            { value: 'iOS + Android', label: 'Cross-Platform' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold text-white">{value}</div>
              <div className="mt-0.5 text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href="/pricing" className="btn-primary">
            Start 14-Day Free Trial
          </a>
          <a href="/why" className="btn-secondary flex items-center gap-2">
            See How We&apos;re Different
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>

        {/* Platform note */}
        <p className="mt-10 text-xs uppercase tracking-widest text-slate-600">
          Available on iOS &amp; Android &nbsp;·&nbsp; No credit card required
        </p>
      </div>
    </section>
  );
}
