'use client';

import { useEffect, useState, useCallback } from 'react';
import { Modal } from '@/components/admin/Modal';

interface Campus {
  id: string;
  name: string;
  address?: string;
  memberCount?: number;
  createdAt: string;
}

export default function CampusesPage() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCampus, setEditCampus] = useState<Campus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Campus | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const fetchCampuses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/proxy/campuses');
      const data = res.ok ? await res.json() : {};
      setCampuses(Array.isArray(data.campuses) ? data.campuses : (Array.isArray(data) ? data : []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampuses(); }, [fetchCampuses]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/proxy/campuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.message ?? 'Failed'); return; }
      setCreateOpen(false); setName(''); setAddress('');
      showToast('Campus created'); fetchCampuses();
    } finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editCampus) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/proxy/campuses/${editCampus.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address }),
      });
      if (!res.ok) { showToast('Failed to update campus'); return; }
      setEditCampus(null); setName(''); setAddress('');
      showToast('Campus updated'); fetchCampuses();
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/proxy/campuses/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) { showToast('Failed to delete campus'); return; }
      setConfirmDelete(null); showToast('Campus deleted'); fetchCampuses();
    } finally { setSaving(false); }
  };

  const openEdit = (c: Campus) => {
    setEditCampus(c); setName(c.name); setAddress(c.address ?? '');
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-navy-800 border border-white/10 rounded-xl px-5 py-3 text-sm text-white shadow-xl">{toast}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Campuses</h1>
          <p className="text-sm text-slate-400 mt-1">{campuses.length} campus{campuses.length !== 1 ? 'es' : ''}</p>
        </div>
        <button
          onClick={() => { setName(''); setAddress(''); setCreateOpen(true); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Campus
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-navy-900 border border-white/10 rounded-2xl p-6 animate-pulse">
              <div className="h-5 bg-white/5 rounded w-32 mb-3" />
              <div className="h-4 bg-white/5 rounded w-48" />
            </div>
          ))}
        </div>
      ) : campuses.length === 0 ? (
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-12 text-center">
          <p className="text-slate-400 mb-4">No campuses yet</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >Add your first campus →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campuses.map((c) => (
            <div key={c.id} className="bg-navy-900 border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-600/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21" />
                  </svg>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(c)} className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">Edit</button>
                  <button onClick={() => setConfirmDelete(c)} className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-all">Delete</button>
                </div>
              </div>
              <h3 className="text-base font-semibold text-white mb-1">{c.name}</h3>
              {c.address && <p className="text-sm text-slate-400 mb-3">{c.address}</p>}
              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <span className="text-xs text-slate-500">{c.memberCount ?? 0} members</span>
                <span className="text-xs text-slate-600">Added {fmt(c.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal
        open={createOpen || !!editCampus}
        onClose={() => { setCreateOpen(false); setEditCampus(null); }}
        title={editCampus ? `Edit — ${editCampus.name}` : 'Add Campus'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Campus Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Main Campus"
              className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Address <span className="text-slate-500">(optional)</span></label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, City, ST 00000"
              className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setCreateOpen(false); setEditCampus(null); }} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={editCampus ? handleUpdate : handleCreate}
              disabled={saving || !name}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all"
            >
              {saving ? 'Saving…' : editCampus ? 'Save Changes' : 'Create Campus'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Campus" size="sm">
        <p className="text-sm text-slate-300 mb-6">
          Delete <strong className="text-white">{confirmDelete?.name}</strong>? Members assigned here will lose their campus assignment.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={handleDelete} disabled={saving} className="px-5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all">
            {saving ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </main>
  );
}
