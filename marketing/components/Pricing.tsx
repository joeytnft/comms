const PLANS = [
  {
    name: 'Starter',
    price: 8,
    description: 'Everything a small team needs to get protected.',
    color: 'default',
    highlighted: false,
    features: [
      '1 lead group + 5 sub-groups',
      'Up to 20 members',
      'End-to-end encrypted messaging',
      'Push-to-talk voice (PTT)',
      'Panic alerts with GPS',
      'Real-time location sharing',
      'Incident logging',
      'iOS & Android apps',
    ],
    cta: 'Start Free Trial',
  },
  {
    name: 'Basic',
    price: 20,
    description: 'More groups and members as your team grows.',
    color: 'blue',
    highlighted: false,
    features: [
      '2 lead groups + unlimited sub-groups',
      'Up to 50 members',
      'Everything in Starter',
      'Service scheduling & check-in',
      'Response plan broadcasting',
    ],
    cta: 'Start Free Trial',
  },
  {
    name: 'Standard',
    price: 40,
    description: 'Unlimited scale for larger security teams.',
    color: 'green',
    highlighted: true,
    features: [
      '5 lead groups + unlimited sub-groups',
      'Unlimited members',
      'Everything in Basic',
      'Priority support',
    ],
    cta: 'Start Free Trial',
  },
  {
    name: 'Enterprise',
    price: 60,
    description: 'Multi-campus organizations and large ministries.',
    color: 'default',
    highlighted: false,
    features: [
      'Unlimited lead groups',
      'Unlimited members',
      'Everything in Standard',
      'Multi-campus support',
    ],
    cta: 'Contact Us',
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-label">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-slate-400">
            Every plan includes a{' '}
            <span className="font-semibold text-white">14-day free trial</span>.
            No credit card required. Cancel anytime.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.highlighted
                  ? 'border-emerald-500/50 bg-emerald-600/8 ring-1 ring-emerald-500/30'
                  : plan.color === 'blue'
                  ? 'border-blue-500/15 bg-blue-600/5'
                  : 'border-white/5 bg-navy-900'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 px-4 py-0.5 text-xs font-bold text-white shadow-lg">
                  Most Popular
                </div>
              )}

              <div className="mb-5">
                <h3 className="font-semibold text-white">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">${plan.price}</span>
                  <span className="text-sm text-slate-500">/month</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{plan.description}</p>
              </div>

              <ul className="mb-6 flex flex-col gap-2.5 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-slate-300">
                    <CheckIcon
                      className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                        plan.highlighted ? 'text-emerald-400' : 'text-emerald-500'
                      }`}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={plan.cta === 'Contact Us' ? 'mailto:hello@gathersafeapp.com' : '#'}
                className={`mt-auto block rounded-xl py-2.5 text-center text-sm font-semibold transition-all ${
                  plan.highlighted
                    ? 'bg-gradient-to-r from-blue-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:opacity-90'
                    : plan.color === 'blue'
                    ? 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 hover:text-white'
                    : 'border border-white/10 text-slate-300 hover:border-white/20 hover:text-white'
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        {/* Add-on */}
        <div className="mt-8 flex items-center gap-5 rounded-2xl border border-emerald-500/20 bg-emerald-600/5 p-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
            <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path strokeLinecap="round" d="M3 9h18M8 4v5M16 4v5" />
              <path strokeLinecap="round" d="M7 14h3M7 17h5" />
              <circle cx="17" cy="15.5" r="2.5" />
              <path strokeLinecap="round" d="M19 17.5l1.5 1.5" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-semibold text-white">Planning Center Integration</span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400">Add-on</span>
              <span className="text-sm font-bold text-white">+$8/mo</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Available on any plan. Sync your Planning Center roster, volunteer schedules, and service plans directly into GatherSafe. No double-entry, no spreadsheets.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          All prices in USD · Billed monthly · Cancel anytime
        </p>
      </div>
    </section>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
