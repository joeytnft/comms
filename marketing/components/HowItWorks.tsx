const STEPS = [
  {
    number: '01',
    color: 'blue',
    title: 'Create your organization',
    description:
      'Sign up, name your church organization, and generate an invite code. Share the code with your security team. They download the app and join in seconds. No IT setup, no configuration files.',
  },
  {
    number: '02',
    color: 'green',
    title: 'Set up your team hierarchy',
    description:
      'Create your lead security group and sub-teams for each area: parking, lobby, interior, children\'s wing, medical response. Connect Planning Center to auto-populate your roster from your existing volunteer schedules.',
  },
  {
    number: '03',
    color: 'blue',
    title: 'Communicate securely, every service',
    description:
      'Your lead team coordinates across all sub-teams from a single screen. Sub-teams stay focused on their area. Everyone has PTT, encrypted messaging, location, and a panic button, all in one app.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-white/5 bg-navy-900/50 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-label">How It Works</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Up and running before Sunday
          </h2>
          <p className="mt-4 text-slate-400">
            No IT department. No hardware to procure. No training manual to write.
            Most teams are fully set up in under an hour.
          </p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.number} className="relative">
              {i < STEPS.length - 1 && (
                <div className="absolute top-6 left-[calc(50%+24px)] hidden h-px w-[calc(100%-48px)] bg-gradient-to-r from-blue-500/30 via-emerald-500/20 to-transparent lg:block" />
              )}
              <div
                className={`rounded-2xl border p-6 ${
                  step.color === 'blue'
                    ? 'border-blue-500/15 bg-blue-600/5'
                    : 'border-emerald-500/15 bg-emerald-600/5'
                }`}
              >
                <div
                  className={`mb-5 flex h-12 w-12 items-center justify-center rounded-full border text-lg font-bold ${
                    step.color === 'blue'
                      ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  }`}
                >
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
