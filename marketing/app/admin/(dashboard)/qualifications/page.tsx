'use client';

import { useEffect, useState, useCallback } from 'react';
import { Modal } from '@/components/admin/Modal';

interface QualType {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
  createdAt: string;
}

interface Member {
  id: string;
  displayName: string;
  email: string;
  qualifications?: { qualificationTypeId: string; qualificationType: { name: string }; earnedAt: string }[];
}

export default function QualificationsPage() {
  const [qualTypes, setQualTypes] = useState<QualType[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<QualType | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [qualName, setQualName] = useState('');
  const [qualDesc, setQualDesc] = useState('');
  const [assignMember, setAssignMember] = useState('');
  const [assignQual, setAssignQual] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [qRes, mRes] = await Promise.all([
        fetch('/api/admin/proxy/qualifications'),
        fetch('/api/admin/proxy/users'),
      ]);
      const qData = qRes.ok ? await qRes.json() : {};
      const mData = mRes.ok ? await mRes.json() : {};
      setQualTypes(Array.isArray(qData.qualifications) ? qData.qualifications : (Array.isArray(qData) ? qData : []));
      setMembers(Array.isArray(mData.users) ? mData.users : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/proxy/qualifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: qualName, description: qualDesc }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.message ?? 'Failed'); return; }
      setCreateOpen(false); setQualName(''); setQualDesc('');
      showToast('Qualification type created'); fetchData();
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/proxy/qualifications/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) { showToast('Failed to delete'); return; }
      setConfirmDelete(null); showToast('Deleted'); fetchData();
    } finally { setSaving(false); }
  };

  const handleAssign = async () => {
    if (!assignMember || !assignQual) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/proxy/users/${assignMember}/qualifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qualificationTypeId: assignQual }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.message ?? 'Failed'); return; }
      setAssignOpen(false); setAssignMember(''); setAssignQual('');
      showToast('Qualification assigned'); fetchData();
    } finally { setSaving(false); }
  };

  return (
    <main className="flex-1 p-8">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-navy-800 border border-white/10 rounded-xl px-5 py-3 text-sm text-white shadow-xl">{toast}</div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Qualifications</h1>
          <p className="text-sm text-slate-400 mt-1">Manage certification types and member assignments</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAssignOpen(true)}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all"
          >
            Assign to Member
          </button>
          <button
            onClick={() => { setQualName(''); setQualDesc(''); setCreateOpen(true); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Type
          </button>
        </div>
      </div>

      {/* Qualification types grid */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Qualification Types</h2>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-navy-900 border border-white/10 rounded-2xl p-6 animate-pulse">
              <div className="h-5 bg-white/5 rounded w-32 mb-3" />
              <div className="h-4 bg-white/5 rounded w-48" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {qualTypes.length === 0 ? (
            <div className="col-span-3 bg-navy-900 border border-white/10 rounded-2xl p-10 text-center">
              <p className="text-slate-400">No qualification types yet.</p>
            </div>
          ) : qualTypes.map((q) => (
            <div key={q.id} className="bg-navy-900 border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/15 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                </div>
                <button onClick={() => setConfirmDelete(q)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all">Delete</button>
              </div>
              <h3 className="font-semibold text-white mb-1">{q.name}</h3>
              {q.description && <p className="text-xs text-slate-400 mb-3">{q.description}</p>}
              <p className="text-xs text-slate-600">{q.memberCount ?? 0} members certified</p>
            </div>
          ))}
        </div>
      )}

      {/* Members with qualifications */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Member Qualifications</h2>
      <div className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-slate-400 uppercase tracking-wide">
                <th className="text-left px-6 py-3.5 font-medium">Member</th>
                <th className="text-left px-6 py-3.5 font-medium">Qualifications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {members.filter((m) => m.qualifications && m.qualifications.length > 0).length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-10 text-center text-slate-500">No qualifications assigned yet</td>
                </tr>
              ) : members.filter((m) => m.qualifications && m.qualifications.length > 0).map((m) => (
                <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-white">{m.displayName}</p>
                    <p className="text-xs text-slate-500">{m.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {m.qualifications?.map((q) => (
                        <span key={q.qualificationTypeId} className="text-xs font-medium bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full">
                          {q.qualificationType.name}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Qualification Type" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
            <input type="text" value={qualName} onChange={(e) => setQualName(e.target.value)} placeholder="CPR Certified" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description <span className="text-slate-500">(optional)</span></label>
            <textarea value={qualDesc} onChange={(e) => setQualDesc(e.target.value)} rows={3} placeholder="Brief description…" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={saving || !qualName} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Assign modal */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign Qualification" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Member</label>
            <select value={assignMember} onChange={(e) => setAssignMember(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
              <option value="">Select member…</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.displayName} ({m.email})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Qualification</label>
            <select value={assignQual} onChange={(e) => setAssignQual(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
              <option value="">Select qualification…</option>
              {qualTypes.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setAssignOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={handleAssign} disabled={saving || !assignMember || !assignQual} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all">
              {saving ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Qualification Type" size="sm">
        <p className="text-sm text-slate-300 mb-6">Delete <strong className="text-white">{confirmDelete?.name}</strong>? This will remove it from all members.</p>
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
