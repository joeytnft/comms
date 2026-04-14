export function CTA() {
  return (
    <section className="border-t border-white/5 bg-navy-900/40 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Start protecting your congregation today
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Join security teams across the country who trust GatherSafe to keep their communities safe.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="#pricing"
              className="rounded-xl bg-brand px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500"
            >
              Start Free Trial
            </a>
            <a
              href="mailto:hello@gathersafeapp.com"
              className="rounded-xl border border-white/10 px-8 py-3.5 text-base font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
