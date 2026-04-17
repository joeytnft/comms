const FEATURES = [
  {
    icon: 'panic',
    title: 'Panic Button & GPS Broadcast',
    body: 'One tap sends exact coordinates to every lead instantly. No verbal location calls under stress, no relay chain, no ambiguity about where the threat is.',
  },
  {
    icon: 'map',
    title: 'Live Team Map',
    body: 'See every active team member\'s real-time position. Spot coverage gaps before they become problems without tying up the radio channel.',
  },
  {
    icon: 'message',
    title: 'Silent Encrypted Messaging',
    body: 'Private text threads for situations where speaking aloud isn\'t safe — near an agitated individual, during worship, in a crowded lobby.',
  },
  {
    icon: 'report',
    title: 'Structured Incident Reports',
    body: 'Encrypted reports with photos, GPS coordinates, and timestamps captured at the moment they happen. The paper trail radios never create.',
  },
  {
    icon: 'plan',
    title: 'One-Tap Response Plans',
    body: 'Pre-loaded procedures broadcast to the full team in a single tap. No relay chains, no misheard instructions, no one acting on a half-heard call.',
  },
  {
    icon: 'ack',
    title: 'Alert Acknowledgment',
    body: 'Know exactly who has seen and confirmed each alert. Radios broadcast into the void — GatherSafe tells you who responded and who hasn\'t.',
  },
  {
    icon: 'checkin',
    title: 'Pre-Service Check-In',
    body: 'Every team member confirms their position before doors open. No roll call over the air, no guessing whether the children\'s wing is covered.',
  },
  {
    icon: 'history',
    title: 'Full Incident History',
    body: 'A searchable, encrypted log of every alert and incident. Essential for after-action reviews, pattern analysis, and insurance documentation.',
  },
];

export function RadioComplement() {
  return (
    <section id="radio-users" className="border-t border-white/5 bg-navy-950 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">

        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-blue-400">
            Already using radios?
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Radios handle the talking.<br className="hidden sm:inline" /> GatherSafe handles everything else.
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Two-way radios are reliable voice tools — keep using them. But voice alone leaves
            critical gaps in situational awareness, documentation, and response coordination.
            GatherSafe runs alongside your existing radio setup and fills every one of them.
          </p>
        </div>

        {/* Feature grid */}
        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/5 bg-navy-900/60 p-5 transition-colors hover:border-white/10"
            >
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800">
                <FeatureIcon name={f.icon} />
              </div>
              <h3 className="mb-1.5 font-semibold leading-snug text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>

        {/* No rip-and-replace callout */}
        <div className="mt-10 flex items-start gap-4 rounded-2xl border border-emerald-500/15 bg-emerald-600/5 p-6 sm:p-8">
          <div className="mt-0.5 flex-shrink-0">
            <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-white">No rip-and-replace required</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              GatherSafe doesn't ask you to abandon infrastructure that works. Your radios stay on
              your team's hips. GatherSafe runs on the phones your volunteers already carry, adding
              a layer of coordination, documentation, and alerting that voice alone can never
              provide — without replacing a single piece of equipment you already own.
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}

function FeatureIcon({ name }: { name: string }) {
  const cls = 'h-5 w-5 text-slate-300';
  switch (name) {
    case 'panic':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
          <circle cx="12" cy="15.5" r="0.75" fill="currentColor" />
        </svg>
      );
    case 'map':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 9m0 8V9m0 0L9 7" />
        </svg>
      );
    case 'message':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case 'report':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'plan':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case 'ack':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'checkin':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      );
    case 'history':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return null;
  }
}
