export function CTA() {
  return (
    <section className="relative overflow-hidden border-t border-white/5 py-24 sm:py-32">
      {/* Bottom green glow */}
      <div className="pointer-events-none absolute inset-0 bg-green-glow" />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/5 bg-navy-900 p-10 text-center sm:p-16">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500">
            <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
            </svg>
          </div>

          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Your congregation deserves{' '}
            <span className="text-gradient">better protection</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
            Join security teams across the country who chose purpose-built tools over generic
            apps. Start your free trial today with no credit card and no commitment.
          </p>

          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="/pricing"
              className="btn-primary"
            >
              Start 14-Day Free Trial
            </a>
            <a
              href="mailto:hello@gathersafeapp.com"
              className="btn-secondary"
            >
              Talk to Our Team
            </a>
          </div>

          <p className="mt-6 text-sm text-slate-600">
            Starting at $8/month &nbsp;·&nbsp; iOS &amp; Android &nbsp;·&nbsp; Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}
