const FEATURES = [
  {
    color: 'blue',
    icon: 'lock',
    title: 'End-to-End Encrypted Messaging',
    description:
      'Built on the Signal Protocol, the gold standard for secure messaging. Every message is encrypted on your device before transmission. Your texts, images, and incident reports are unreadable to anyone except your team.',
  },
  {
    color: 'green',
    icon: 'mic',
    title: 'Push-to-Talk Voice',
    description:
      'Sub-second walkie-talkie voice powered by LiveKit WebRTC. Hold to talk from the on-screen button, a physical volume key, or a Bluetooth PTT accessory. Stays active on a locked screen via a foreground service on Android and VoIP session on iOS.',
  },
  {
    color: 'blue',
    icon: 'alert',
    title: 'Panic Alerts and Alert Levels',
    description:
      'One tap broadcasts an emergency alert with your GPS coordinates to every team member simultaneously, even if the app is closed. Three alert levels (Attention, Warning, Emergency) with acknowledgment tracking so leadership knows who responded.',
  },
  {
    color: 'green',
    icon: 'map',
    title: 'Real-Time Team Location',
    description:
      'Live map shows every team member\'s position during services and events. Opt-in location sharing with geofence check-in prompts volunteers automatically when they arrive at the building. No more "is anyone in the parking lot yet?" messages.',
  },
  {
    color: 'blue',
    icon: 'hierarchy',
    title: 'Hierarchical Group Structure',
    description:
      'Create a lead security group that receives all messages from all sub-teams. Parking, interior, children\'s wing, and medical each operate privately while your security director sees and speaks to every team simultaneously from one screen.',
  },
  {
    color: 'green',
    icon: 'report',
    title: 'Incident Logging and Response Plans',
    description:
      'Encrypted incident reports with photos, GPS coordinates, and timestamps create a permanent, auditable record. Pre-configure response plans and broadcast them to your entire team with a single tap when a situation escalates.',
  },
  {
    color: 'blue',
    icon: 'pco',
    title: 'Planning Center Integration',
    description:
      'Available as an $8/mo add-on. Connect your Planning Center account and your service roster syncs automatically. Volunteer schedules, team assignments, and upcoming service plans flow directly into GatherSafe. No spreadsheets, no double-entry, no day-of scramble.',
    addon: true,
  },
  {
    color: 'green',
    icon: 'bluetooth',
    title: 'Bluetooth PTT Accessories',
    description:
      'Pair any BLE push-to-talk button including Retevis, Baofeng BT-PTT, and similar HID accessories. Clip it to your belt or earpiece and operate completely hands-free, just like a two-way radio, without the expensive hardware or monthly licensing fees.',
  },
] as const;

export function Features() {
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-label">Full Feature Set</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything your security team needs, nothing they don&apos;t
          </h2>
          <p className="mt-4 text-slate-400">
            Every feature was chosen because real church security teams asked for it.
            No bloat. No generic enterprise features repurposed for congregations.
          </p>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`group rounded-2xl border p-6 transition-all ${
                f.color === 'blue'
                  ? 'border-blue-500/10 bg-blue-600/5 hover:border-blue-500/20 hover:bg-blue-600/8'
                  : 'border-emerald-500/10 bg-emerald-600/5 hover:border-emerald-500/20 hover:bg-emerald-600/8'
              }`}
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <div
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                    f.color === 'blue' ? 'bg-blue-500/15' : 'bg-emerald-500/15'
                  }`}
                >
                  <FeatureIcon name={f.icon} color={f.color} />
                </div>
                {'addon' in f && f.addon && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                    Add-on
                  </span>
                )}
              </div>
              <h3 className="mb-2 font-semibold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureIcon({ name, color }: { name: string; color: string }) {
  const cls = `h-5 w-5 ${color === 'blue' ? 'text-blue-400' : 'text-emerald-400'}`;
  switch (name) {
    case 'lock':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path strokeLinecap="round" d="M7 11V7a5 5 0 0 1 10 0v4" />
          <circle cx="12" cy="16" r="1" fill="currentColor" />
        </svg>
      );
    case 'mic':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
        </svg>
      );
    case 'alert':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12.01" y2="17" strokeLinecap="round" />
        </svg>
      );
    case 'map':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
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
    case 'report':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline strokeLinecap="round" strokeLinejoin="round" points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" />
          <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" />
        </svg>
      );
    case 'pco':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path strokeLinecap="round" d="M3 9h18M8 4v5M16 4v5" />
          <path strokeLinecap="round" d="M7 14h3M7 17h5" />
          <circle cx="17" cy="15.5" r="2.5" />
          <path strokeLinecap="round" d="M19 17.5l1.5 1.5" />
        </svg>
      );
    case 'bluetooth':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <polyline strokeLinecap="round" strokeLinejoin="round" points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
        </svg>
      );
    default:
      return null;
  }
}
