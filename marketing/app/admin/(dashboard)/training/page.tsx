'use client';

import { useEffect, useState, useCallback } from 'react';
import { Modal } from '@/components/admin/Modal';

interface TrainingEvent {
  id: string;
  title: string;
  description?: string;
  scheduledAt: string;
  durationMinutes: number;
  location?: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  signupCount?: number;
  requiredForAll?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: 'bg-blue-500/15 text-blue-400',
  COMPLETED: 'bg-emerald-500/15 text-emerald-400',
  CANCELLED: 'bg-red-500/15 text-red-400',
};

export default function TrainingPage() {
  const [events, setEvents] = useState<TrainingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<TrainingEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState<'all' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'>('all');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState('60');
  const [location, setLocation] = useState('');
  const [required, setRequired] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/proxy/training');
      const data = res.ok ? await res.json() : {};
      setEvents(Array.isArray(data.trainings) ? data.trainings : (Array.isArray(data) ? data : []));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/proxy/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: parseInt(duration),
          location,
          requiredForAll: required,
        }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.message ?? 'Failed'); return; }
      setCreateOpen(false);
      setTitle(''); setDescription(''); setScheduledAt(''); setDuration('60'); setLocation(''); setRequired(false);
      showToast('Training event created'); fetchEvents();
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetch(`/api/admin/proxy/training/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      showToast('Status updated'); fetchEvents();
    } catch { showToast('Failed to update status'); }
  };

  const filtered = filter === 'all' ? events : events.filter((e) => e.status === filter);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <main className="flex-1 p-8">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-navy-800 border border-white/10 rounded-xl px-5 py-3 text-sm text-white shadow-xl">{toast}</div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Training</h1>
          <p className="text-sm text-slate-400 mt-1">{events.length} event{events.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Create Training
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 bg-navy-900 border border-white/10 rounded-xl p-1 w-fit">
        {(['all', 'SCHEDULED', 'COMPLETED', 'CANCELLED'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${filter === f ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-navy-900 border border-white/10 rounded-2xl p-5 animate-pulse">
              <div className="h-5 bg-white/5 rounded w-64 mb-3" />
              <div className="h-4 bg-white/5 rounded w-40" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-12 text-center">
          <p className="text-slate-400">No {filter !== 'all' ? filter.toLowerCase() : ''} training events</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ev) => (
            <div
              key={ev.id}
              className="bg-navy-900 border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all cursor-pointer"
              onClick={() => setDetailEvent(ev)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-white">{ev.title}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[ev.status]}`}>
                      {ev.status.charAt(0) + ev.status.slice(1).toLowerCase()}
                    </span>
                    {ev.requiredForAll && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Required</span>
                    )}
                  </div>
                  {ev.description && <p className="text-sm text-slate-400 mb-2 line-clamp-1">{ev.description}</p>}
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>{fmtDate(ev.scheduledAt)} at {fmtTime(ev.scheduledAt)}</span>
                    <span>{ev.durationMinutes} min</span>
                    {ev.location && <span>{ev.location}</span>}
                    {ev.signupCount !== undefined && <span>{ev.signupCount} signed up</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {ev.status === 'SCHEDULED' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(ev.id, 'COMPLETED')}
                        className="text-xs text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 transition-all"
                      >
                        Mark Complete
                      </button>
                      <button
                        onClick={() => handleStatusChange(ev.id, 'CANCELLED')}
                        className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Training Event" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Active Shooter Response" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description <span className="text-slate-500">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Date &amp; Time</label>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Duration (minutes)</label>
            <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min="15" max="480" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Location <span className="text-slate-500">(optional)</span></label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Fellowship Hall, Room 201" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <input type="checkbox" id="req-all" checked={required} onChange={(e) => setRequired(e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
            <label htmlFor="req-all" className="text-sm text-slate-300">Required for all members</label>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !title || !scheduledAt} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all">
            {saving ? 'Creating…' : 'Create Event'}
          </button>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detailEvent} onClose={() => setDetailEvent(null)} title={detailEvent?.title ?? ''} size="md">
        {detailEvent && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[detailEvent.status]}`}>
                {detailEvent.status.charAt(0) + detailEvent.status.slice(1).toLowerCase()}
              </span>
              {detailEvent.requiredForAll && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Required</span>
              )}
            </div>
            {detailEvent.description && <p className="text-sm text-slate-300">{detailEvent.description}</p>}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-navy-800 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-0.5">Date &amp; Time</p>
                <p className="text-white">{fmtDate(detailEvent.scheduledAt)} at {fmtTime(detailEvent.scheduledAt)}</p>
              </div>
              <div className="bg-navy-800 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-0.5">Duration</p>
                <p className="text-white">{detailEvent.durationMinutes} minutes</p>
              </div>
              {detailEvent.location && (
                <div className="bg-navy-800 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-0.5">Location</p>
                  <p className="text-white">{detailEvent.location}</p>
                </div>
              )}
              <div className="bg-navy-800 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-0.5">Signups</p>
                <p className="text-white">{detailEvent.signupCount ?? 0}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setDetailEvent(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}
