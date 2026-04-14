const PLANS = [
  {
    name: 'Starter',
    price: 8,
    description: 'Perfect for small security teams getting started.',
    features: [
      '1 lead group',
      '5 sub-groups',
      'Up to 20 members',
      'Encrypted messaging',
      'Push-to-talk voice',
      'Panic alerts',
      'Location sharing',
      'Incident logging',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Basic',
    price: 20,
    description: 'For growing teams that need more flexibility.',
    features: [
      '2 lead groups',
      'Unlimited sub-groups',
      'Up to 50 members',
      'Everything in Starter',
      'Schedule & check-in',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Standard',
    price: 40,
    description: 'For established teams with unlimited members.',
    features: [
      '5 lead groups',
      'Unlimited sub-groups',
      'Unlimited members',
      'Everything in Basic',
      'Priority support',
    ],
    cta: 'Get Started',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 60,
    description: 'For multi-campus organizations and large ministries.',
    features: [
      'Unlimited lead groups',
      'Unlimited sub-groups',
      'Unlimited members',
      'Everything in Standard',
      'Multi-campus support',
      'Dedicated onboarding',
    ],
    cta: 'Contact Us',
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-slate-400">
            All plans include a 14-day free trial. No credit card required to start.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.highlighted
                  ? 'border-blue-500 bg-blue-600/10 ring-1 ring-blue-500/50'
                  : 'border-white/5 bg-navy-900'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-3 py-0.5 text-xs font-semibold text-white">
                  Most Popular
                </div>
              )}

              <div className="mb-4">
                <h3 className="font-semibold text-white">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">${plan.price}</span>
                  <span className="text-sm text-slate-400">/month</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{plan.description}</p>
              </div>

              <ul className="mb-6 flex flex-col gap-2.5 text-sm text-slate-300">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-400" />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href="mailto:hello@gathersafeapp.com"
                className={`mt-auto block rounded-xl py-2.5 text-center text-sm font-semibold transition-all ${
                  plan.highlighted
                    ? 'bg-brand text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500'
                    : 'border border-white/10 text-white hover:border-white/20 hover:bg-white/5'
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-slate-500">
          All prices in USD. Billed monthly. Cancel anytime.
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
