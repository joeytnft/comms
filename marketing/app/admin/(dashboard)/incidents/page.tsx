'use client';

import { useEffect, useState, useCallback } from 'react';
import { Modal } from '@/components/admin/Modal';

interface IncidentPhoto {
  encryptedUrl: string;
}

interface Incident {
  id: string;
  title: string;
  status?: string;
  lat?: number;
  lng?: number;
  reportedBy?: { displayName: string; email: string };
  campus?: { name: string };
  encryptedDetails?: string;
  photos?: IncidentPhoto[];
  createdAt: string;
  updatedAt?: string;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-amber-500/15 text-amber-400',
  RESOLVED: 'bg-emerald-500/15 text-emerald-400',
  CLOSED: 'bg-slate-500/15 text-slate-400',
};

function exportCsv(incidents: Incident[]) {
  const headers = ['ID', 'Title', 'Status', 'Reported By', 'Campus', 'Latitude', 'Longitude', 'Date'];
  const rows = incidents.map((inc) => [
    inc.id,
    `"${inc.title.replace(/"/g, '""')}"`,
    inc.status ?? '',
    inc.reportedBy?.displayName ?? '',
    inc.campus?.name ?? '',
    inc.lat ?? '',
    inc.lng ?? '',
    new Date(inc.createdAt).toISOString(),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `incidents-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/admin/proxy/incidents?${params}`);
      const data = res.ok ? await res.json() : {};
      setIncidents(Array.isArray(data.incidents) ? data.incidents : (Array.isArray(data) ? data : []));
      setTotal(data.total ?? 0);
    } finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  const filtered = incidents.filter((inc) =>
    inc.title.toLowerCase().includes(search.toLowerCase()) ||
    (inc.reportedBy?.displayName ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleStatusUpdate = async (id: string, status: string) => {
    await fetch(`/api/admin/proxy/incidents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchIncidents();
    if (selected?.id === id) setSelected((s) => s ? { ...s, status } : s);
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Incident Reports</h1>
          <p className="text-sm text-slate-400 mt-1">{total} total incidents</p>
        </div>
        <button
          onClick={() => exportCsv(incidents)}
          disabled={incidents.length === 0}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-600/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-0 sm:flex-none">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input type="text" placeholder="Search incidents…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-64 bg-navy-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-slate-400 uppercase tracking-wide">
                <th className="text-left px-6 py-3.5 font-medium">Incident</th>
                <th className="text-left px-6 py-3.5 font-medium">Reported By</th>
                <th className="text-left px-6 py-3.5 font-medium">Campus</th>
                <th className="text-left px-6 py-3.5 font-medium">Status</th>
                <th className="text-left px-6 py-3.5 font-medium">Date</th>
                <th className="text-right px-6 py-3.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((__, j) => <td key={j} className="px-6 py-4"><div className="h-4 bg-white/5 rounded animate-pulse" /></td>)}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">No incidents found</td></tr>
              ) : filtered.map((inc) => (
                <tr key={inc.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <button onClick={() => setSelected(inc)} className="text-left">
                      <p className="font-medium text-white hover:text-blue-400 transition-colors">{inc.title}</p>
                      <p className="text-xs text-slate-600 font-mono">{inc.id.slice(0, 8)}…</p>
                    </button>
                  </td>
                  <td className="px-6 py-4 text-slate-300">{inc.reportedBy?.displayName ?? '—'}</td>
                  <td className="px-6 py-4 text-slate-300">{inc.campus?.name ?? '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[inc.status ?? 'OPEN'] ?? 'bg-white/5 text-slate-400'}`}>
                      {inc.status ?? 'OPEN'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 whitespace-nowrap">{fmt(inc.createdAt)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {inc.status !== 'RESOLVED' && (
                        <button onClick={() => handleStatusUpdate(inc.id, 'RESOLVED')} className="text-xs text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 transition-all">Resolve</button>
                      )}
                      {inc.status !== 'CLOSED' && (
                        <button onClick={() => handleStatusUpdate(inc.id, 'CLOSED')} className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">Close</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-30 bg-navy-900 border border-white/10 rounded-xl transition-all">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-30 bg-navy-900 border border-white/10 rounded-xl transition-all">Next</button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? ''} size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[selected.status ?? 'OPEN']}`}>
                {selected.status ?? 'OPEN'}
              </span>
              <span className="text-xs text-slate-500">{fmt(selected.createdAt)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-navy-800 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-0.5">Reported By</p>
                <p className="text-white">{selected.reportedBy?.displayName ?? '—'}</p>
                <p className="text-xs text-slate-500">{selected.reportedBy?.email}</p>
              </div>
              <div className="bg-navy-800 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-0.5">Campus</p>
                <p className="text-white">{selected.campus?.name ?? '—'}</p>
              </div>
              {selected.lat && selected.lng && (
                <div className="bg-navy-800 rounded-xl p-3 col-span-2">
                  <p className="text-xs text-slate-500 mb-0.5">Location</p>
                  <p className="text-white font-mono text-xs">{selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}</p>
                </div>
              )}
            </div>
            {selected.photos && selected.photos.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Photos ({selected.photos.length})</p>
                <div className="flex gap-2 flex-wrap">
                  {selected.photos.map((p, i) => (
                    <a key={i} href={p.encryptedUrl} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.encryptedUrl} alt={`Photo ${i + 1}`} className="w-20 h-20 object-cover rounded-xl border border-white/10 hover:border-blue-500/40 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-2">
                {selected.status !== 'RESOLVED' && (
                  <button onClick={() => handleStatusUpdate(selected.id, 'RESOLVED')} className="text-sm text-emerald-400 hover:text-emerald-300 px-4 py-2 rounded-xl hover:bg-emerald-500/10 transition-all border border-emerald-500/20">Mark Resolved</button>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}
