const FEATURES = [
  {
    icon: 'lock',
    title: 'End-to-End Encrypted Messaging',
    description:
      'Messages are encrypted on your device using the Signal Protocol. The server routes encrypted blobs and never sees plaintext — ever.',
  },
  {
    icon: 'mic',
    title: 'Push-to-Talk Voice',
    description:
      'Walkie-talkie style PTT for your whole team. Works with on-screen buttons, volume keys, and dedicated Bluetooth PTT accessories.',
  },
  {
    icon: 'alert',
    title: 'Panic Alerts',
    description:
      'One-tap emergency alerts broadcast GPS coordinates and alert level to every team member instantly, even when the app is in the background.',
  },
  {
    icon: 'map',
    title: 'Real-Time Location',
    description:
      'Lead team sees every member on a live map. Opt-in location sharing with geofence check-in when members arrive at church.',
  },
  {
    icon: 'hierarchy',
    title: 'Group Hierarchy',
    description:
      'Lead group monitors all sub-teams. Parking, interior, children\'s wing — each team is isolated while leadership sees the full picture.',
  },
  {
    icon: 'report',
    title: 'Incident Logging',
    description:
      'Encrypted incident reports with photos, timestamps, and GPS coordinates. Build a documented history of every event and response.',
  },
] as const;

export function Features() {
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">Features</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything your security team needs
          </h2>
          <p className="mt-4 text-slate-400">
            Designed specifically for the realities of protecting a congregation — from Sunday services to special events.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/5 bg-navy-900 p-6 transition-colors hover:border-white/10"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15">
                <FeatureIcon name={f.icon} />
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

function FeatureIcon({ name }: { name: string }) {
  const cls = 'h-5 w-5 text-blue-400';
  switch (name) {
    case 'lock':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path strokeLinecap="round" d="M7 11V7a5 5 0 0 1 10 0v4" />
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
          <polygon strokeLinecap="round" strokeLinejoin="round" points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" strokeLinecap="round" />
          <line x1="16" y1="6" x2="16" y2="22" strokeLinecap="round" />
        </svg>
      );
    case 'hierarchy':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <rect x="2" y="3" width="6" height="4" rx="1" />
          <rect x="16" y="3" width="6" height="4" rx="1" />
          <rect x="9" y="17" width="6" height="4" rx="1" />
          <path strokeLinecap="round" d="M5 7v3h14V7M12 10v7" />
        </svg>
      );
    case 'report':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline strokeLinecap="round" strokeLinejoin="round" points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" />
          <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" />
          <polyline strokeLinecap="round" points="10 9 9 9 8 9" />
        </svg>
      );
    default:
      return null;
  }
}
