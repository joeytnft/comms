const DIFFERENTIATORS = [
  {
    color: 'blue',
    icon: 'church',
    title: 'Built for Churches, Not Adapted for Them',
    description:
      'Generic PTT apps like Zello were built for warehouses and construction sites. GatherSafe was designed around the realities of protecting a congregation — pre-service setup, multi-team coordination during a live service, and the chain-of-command structure faith communities actually use.',
  },
  {
    color: 'green',
    icon: 'lock',
    title: 'Zero-Knowledge Encryption',
    description:
      'We use the Signal Protocol — the same standard that protects journalists and activists worldwide. Your messages are encrypted on your device before they ever leave it. Our server routes encrypted blobs and cannot read a single word. No other church security app can say that.',
  },
  {
    color: 'blue',
    icon: 'pco',
    title: 'Planning Center Integration',
    description:
      'Connect your Planning Center account and your service roster syncs automatically. Volunteer schedules, team assignments, and upcoming service plans flow directly into GatherSafe — no spreadsheets, no double-entry, no day-of scramble to figure out who\'s covering which door.',
  },
  {
    color: 'green',
    icon: 'radio',
    title: 'Real PTT — Not a Workaround',
    description:
      'Most apps require you to unlock your phone and tap through menus to talk. GatherSafe runs a persistent background service so PTT works from your lock screen, with Bluetooth PTT accessories, and with physical volume buttons — exactly like a real radio. Apple and Android both supported.',
  },
  {
    color: 'blue',
    icon: 'hierarchy',
    title: 'Group Hierarchy That Mirrors Your Structure',
    description:
      'Your parking team doesn\'t need to hear interior chatter, and vice versa. GatherSafe\'s lead-group model gives your security director a unified view of every sub-team while keeping each team\'s channel private. One app, full situational awareness for leadership, zero noise for everyone else.',
  },
  {
    color: 'green',
    icon: 'offline',
    title: 'Offline-First Reliability',
    description:
      'Church buildings are notorious for dead spots and overloaded Wi-Fi during services. GatherSafe queues messages locally and syncs the moment connectivity returns. PTT keeps working over cellular when Wi-Fi drops. Your team stays connected even when the signal doesn\'t.',
  },
];

export function WhyDifferent() {
  return (
    <section id="why" className="border-t border-white/5 bg-navy-900/50 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-label">Why GatherSafe</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Not just another PTT app
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Every security app claims to be the best. Here&apos;s what actually makes us different — and why it matters for your congregation.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DIFFERENTIATORS.map((d) => (
            <div
              key={d.title}
              className={`rounded-2xl border p-6 transition-colors ${
                d.color === 'blue'
                  ? 'border-blue-500/15 bg-blue-600/5 hover:border-blue-500/25'
                  : 'border-emerald-500/15 bg-emerald-600/5 hover:border-emerald-500/25'
              }`}
            >
              <div
                className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                  d.color === 'blue' ? 'bg-blue-500/15' : 'bg-emerald-500/15'
                }`}
              >
                <DiffIcon name={d.icon} color={d.color} />
              </div>
              <h3 className="mb-2 font-semibold leading-snug text-white">{d.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{d.description}</p>
            </div>
          ))}
        </div>

        {/* Comparison callout */}
        <div className="mt-14 rounded-2xl border border-white/5 bg-navy-900 p-8">
          <p className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-slate-500">
            How GatherSafe compares
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="pb-3 text-left font-medium text-slate-400">Capability</th>
                  <th className="pb-3 text-center font-semibold text-white">GatherSafe</th>
                  <th className="pb-3 text-center font-medium text-slate-500">Generic PTT Apps</th>
                  <th className="pb-3 text-center font-medium text-slate-500">Two-Way Radios</th>
                  <th className="pb-3 text-center font-medium text-slate-500">Consumer Chat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  ['End-to-end encryption', true, false, false, 'partial'],
                  ['Push-to-talk voice', true, true, true, false],
                  ['Works on locked screen', true, false, true, false],
                  ['Bluetooth PTT accessories', true, false, true, false],
                  ['Group hierarchy / sub-teams', true, false, false, false],
                  ['Panic alerts with GPS', true, false, false, false],
                  ['Real-time team map', true, false, false, false],
                  ['Planning Center sync', true, false, false, false],
                  ['Incident logging', true, false, false, false],
                  ['Offline message queuing', true, false, false, 'partial'],
                ].map(([label, gs, ptt, radio, chat]) => (
                  <tr key={String(label)} className="text-slate-400">
                    <td className="py-2.5 pr-4 text-slate-300">{label}</td>
                    <td className="py-2.5 text-center"><StatusDot value={gs} /></td>
                    <td className="py-2.5 text-center"><StatusDot value={ptt} /></td>
                    <td className="py-2.5 text-center"><StatusDot value={radio} /></td>
                    <td className="py-2.5 text-center"><StatusDot value={chat} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusDot({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center">
        <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (value === 'partial') {
    return <span className="text-yellow-500/80">~</span>;
  }
  return (
    <span className="inline-flex items-center justify-center">
      <svg className="h-4 w-4 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function DiffIcon({ name, color }: { name: string; color: string }) {
  const cls = `h-5 w-5 ${color === 'blue' ? 'text-blue-400' : 'text-emerald-400'}`;
  switch (name) {
    case 'church':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4M8 6l4-4 4 4M3 10h18M5 10v10a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1V10" />
        </svg>
      );
    case 'lock':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path strokeLinecap="round" d="M7 11V7a5 5 0 0 1 10 0v4" />
          <circle cx="12" cy="16" r="1" fill="currentColor" />
        </svg>
      );
    case 'pco':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path strokeLinecap="round" d="M3 9h18M8 4v5M16 4v5" />
          <path strokeLinecap="round" d="M7 14h4M7 17h6" />
        </svg>
      );
    case 'radio':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
        </svg>
      );
    case 'hierarchy':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <rect x="9" y="2" width="6" height="4" rx="1" />
          <rect x="2" y="17" width="6" height="4" rx="1" />
          <rect x="9" y="17" width="6" height="4" rx="1" />
          <rect x="16" y="17" width="6" height="4" rx="1" />
          <path strokeLinecap="round" d="M12 6v5M5 17v-4h14v4" />
        </svg>
      );
    case 'offline':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M1 6l5.5 5.5M6.5 11.5A10.95 10.95 0 0112 10c1.9 0 3.68.5 5.22 1.36M17.5 7A15.93 15.93 0 0012 6C8.67 6 5.6 7.05 3.1 8.9M23 1L1 23" />
          <circle cx="12" cy="18" r="2" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}
