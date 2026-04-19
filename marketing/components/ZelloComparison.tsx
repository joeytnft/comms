import { CTA } from '@/components/CTA';

const COMPARISON_ROWS: [string, string, CellValue, CellValue][] = [
  ['End-to-end encrypted text', 'Signal Protocol — server sees zero plaintext', true, false],
  ['Zero-knowledge server', 'We route encrypted blobs only', true, false],
  ['End-to-end encrypted voice', 'SRTP + LiveKit E2EE insertable streams', true, false],
  ['Group hierarchy (lead + sub-teams)', 'Lead sees all sub-teams; sub-teams stay isolated', true, false],
  ['Panic button with GPS broadcast', 'One tap, instant location alert to all leads', true, false],
  ['Tiered alert levels', 'Attention / Warning / Emergency system', true, false],
  ['Alert acknowledgment tracking', 'Know who has seen each alert', true, false],
  ['Incident reporting', 'Encrypted reports with photos, GPS, timestamps', true, false],
  ['Pre-configured response plans', 'One-tap broadcast of response procedures', true, false],
  ['Real-time team map', 'Live positions for all active team members', true, false],
  ['Lock screen PTT', 'No unlock required — works like a real radio', true, 'partial'],
  ['Bluetooth PTT accessories', 'Any HID device vs. Zello approved list only', true, 'partial'],
  ['App lock / PIN + biometric', 'Prevent unauthorized use if phone is grabbed', true, false],
  ['Drill / training mode', 'Practice without triggering real alerts', true, false],
  ['Planning Center sync', 'Auto-import service rosters and team assignments', true, false],
];

type CellValue = boolean | 'partial';

const DEEP_DIVES = [
  {
    icon: 'lock',
    label: 'Encryption',
    title: 'Your conversations stay yours',
    body: 'Zello encrypts data in transit using TLS — the same standard your bank uses. But Zello holds the keys, which means Zello can read your messages and audio if compelled by law enforcement, a data breach, or an insider threat. GatherSafe uses the Signal Protocol for text and LiveKit E2EE for voice. Your messages are encrypted on your device before they leave it. Our server never holds a key that can unlock a single word.',
    color: 'blue' as const,
  },
  {
    icon: 'hierarchy',
    label: 'Group Structure',
    title: 'A hierarchy that mirrors your team',
    body: 'Zello uses flat channels. Your security director would need to manually monitor six separate channels during a live service. GatherSafe\'s lead-group model gives leadership a unified feed of every sub-team while keeping each sub-team\'s channel private. Parking doesn\'t hear the children\'s wing team, and neither hears the interior team — but your security director hears all three.',
    color: 'green' as const,
  },
  {
    icon: 'alert',
    label: 'Alerting',
    title: 'A full alert system, not an afterthought',
    body: 'Zello has no native panic or alert system. A threat notification over PTT requires whoever hears it to manually relay it. GatherSafe\'s panic button instantly broadcasts GPS coordinates to every lead-group member with tiered severity levels (Attention, Warning, Emergency), a push notification that wakes the phone even if the app is closed, and an acknowledgment system so you know who has responded.',
    color: 'blue' as const,
  },
  {
    icon: 'server',
    label: 'Data Security',
    title: 'Zero-knowledge architecture',
    body: 'Zello encrypts data in transit with TLS — but Zello holds the keys. If their servers are breached or compelled by law enforcement, your communications are exposed. GatherSafe\'s server never holds a key that can decrypt a single message or audio stream. Messages are encrypted on-device before transmission using the Signal Protocol. Even if our servers were completely compromised, an attacker would find only unreadable ciphertext. Your congregation\'s security communications stay yours.',
    color: 'green' as const,
  },
];

export function ZelloComparison() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-white/5 bg-navy-950 pb-20 pt-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="section-label">GatherSafe vs. Zello</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Purpose-built beats adapted
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-400">
            Zello is a great general-purpose PTT app. But church security teams have specific
            needs — encrypted communications, command hierarchy, panic alerts, incident logs —
            that Zello was never designed to handle.
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="border-b border-white/5 bg-navy-900/50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-10 text-center">
            <p className="section-label">Feature by feature</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Side-by-side comparison</h2>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-navy-900">
                  <th className="px-5 py-4 text-left font-medium text-slate-400 w-1/2">Capability</th>
                  <th className="px-5 py-4 text-center font-semibold text-white">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldIcon className="h-4 w-4 text-blue-400" />
                      GatherSafe
                    </span>
                  </th>
                  <th className="px-5 py-4 text-center font-medium text-slate-500">Zello</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {COMPARISON_ROWS.map(([label, note, gs, zello]) => (
                  <tr key={label} className="group bg-navy-950 transition-colors hover:bg-navy-900/60">
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-slate-200">{label}</span>
                      <span className="ml-2 text-xs text-slate-500">{note}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Cell value={gs} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Cell value={zello} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-center text-xs text-slate-600">
            ~ = partial or limited support &nbsp;·&nbsp; Based on Zello public documentation as of April 2026
          </p>
        </div>
      </section>

      {/* Deep-dive cards */}
      <section className="border-b border-white/5 bg-navy-950 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-12 text-center">
            <p className="section-label">Why it matters</p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">The differences that count under pressure</h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {DEEP_DIVES.map((d) => (
              <div
                key={d.title}
                className={`rounded-2xl border p-7 ${
                  d.color === 'blue'
                    ? 'border-blue-500/15 bg-blue-600/5'
                    : 'border-emerald-500/15 bg-emerald-600/5'
                }`}
              >
                <div
                  className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                    d.color === 'blue' ? 'bg-blue-500/15' : 'bg-emerald-500/15'
                  }`}
                >
                  <DeepDiveIcon name={d.icon} color={d.color} />
                </div>
                <p className={`mb-1 text-xs font-semibold uppercase tracking-widest ${
                  d.color === 'blue' ? 'text-blue-400' : 'text-emerald-400'
                }`}>
                  {d.label}
                </p>
                <h3 className="mb-3 text-lg font-semibold leading-snug text-white">{d.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Verdict banner */}
      <section className="bg-navy-900/50 py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">
            The bottom line
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-400">
            If your team just needs walkie-talkie style PTT for a construction crew, Zello works.
            If your team is responsible for protecting a congregation — and the conversations you
            have include descriptions of threats, medical conditions, and vulnerable individuals —
            you need a tool built for that responsibility. Zello wasn't. GatherSafe was.
          </p>
        </div>
      </section>

      <CTA />
    </>
  );
}

function Cell({ value }: { value: CellValue }) {
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
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center text-sm font-bold text-yellow-500/80">~</span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center">
      <svg className="h-4 w-4 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
    </svg>
  );
}

function DeepDiveIcon({ name, color }: { name: string; color: 'blue' | 'green' }) {
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
    case 'alert':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" strokeLinecap="round" />
          <circle cx="12" cy="17" r="0.5" fill="currentColor" />
        </svg>
      );
    case 'server':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <rect x="2" y="2" width="20" height="8" rx="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" />
          <circle cx="6" cy="6" r="1" fill="currentColor" />
          <circle cx="6" cy="18" r="1" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}
