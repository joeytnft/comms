const STEPS = [
  {
    number: '01',
    title: 'Create your organization',
    description:
      'Sign up, create your church organization, and invite your security team members using a simple invite code.',
  },
  {
    number: '02',
    title: 'Set up your team hierarchy',
    description:
      'Create your lead security group and sub-teams for each area — parking, interior, children\'s wing, and more.',
  },
  {
    number: '03',
    title: 'Communicate securely during services',
    description:
      'Use PTT voice and encrypted text to coordinate your team. Trigger panic alerts and share locations when it matters most.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-white/5 bg-navy-900/40 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">How It Works</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Up and running in minutes
          </h2>
          <p className="mt-4 text-slate-400">
            No complex setup. No IT department required. Your team is protected in three simple steps.
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.number} className="relative">
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="absolute top-6 left-1/2 hidden h-px w-full bg-gradient-to-r from-blue-500/40 to-transparent sm:block" />
              )}
              <div className="relative flex flex-col items-center text-center sm:items-start sm:text-left">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-lg font-bold text-blue-400">
                  {step.number}
                </div>
                <h3 className="mb-2 font-semibold text-white">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
