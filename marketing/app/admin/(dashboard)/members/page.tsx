'use client';

import { useEffect, useState, useCallback } from 'react';
import { Modal } from '@/components/admin/Modal';

interface Campus {
  id: string;
  name: string;
}

interface Member {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  isOrgAdmin: boolean;
  role: string;
  campusId?: string;
  campus?: { name: string };
  accountStatus: string;
  createdAt: string;
  lastSeenAt?: string;
}

const ROLES = ['member', 'admin'];

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Member | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteCampus, setInviteCampus] = useState('');

  // Edit form state
  const [editRole, setEditRole] = useState('');
  const [editCampus, setEditCampus] = useState('');
  const [editAdmin, setEditAdmin] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([
        fetch('/api/admin/proxy/users/org-members'),
        fetch('/api/admin/proxy/campuses'),
      ]);
      const mData = mRes.ok ? await mRes.json() : {};
      const cData = cRes.ok ? await cRes.json() : {};
      setMembers(Array.isArray(mData.members) ? mData.members : []);
      setCampuses(Array.isArray(cData.campuses) ? cData.campuses : (Array.isArray(cData) ? cData : []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = members.filter((m) =>
    m.displayName.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()),
  );

  const handleInvite = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/proxy/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          displayName: inviteName,
          role: inviteRole,
          campusId: inviteCampus || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        showToast(d.message ?? 'Failed to send invite');
        return;
      }
      setInviteOpen(false);
      setInviteEmail(''); setInviteName(''); setInviteRole('member'); setInviteCampus('');
      showToast('Invite sent successfully');
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (m: Member) => {
    setEditMember(m);
    setEditRole(m.role);
    setEditCampus(m.campusId ?? '');
    setEditAdmin(m.isOrgAdmin);
  };

  const handleSaveEdit = async () => {
    if (!editMember) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/proxy/users/${editMember.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isOrgAdmin: editAdmin,
          campusId: editCampus || null,
        }),
      });
      if (!res.ok) { showToast('Failed to update member'); return; }
      setEditMember(null);
      showToast('Member updated');
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/proxy/users/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) { showToast('Failed to remove member'); return; }
      setConfirmDelete(null);
      showToast('Member removed');
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: 'bg-emerald-500/15 text-emerald-400',
      INVITED: 'bg-amber-500/15 text-amber-400',
      SUSPENDED: 'bg-red-500/15 text-red-400',
    };
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? 'bg-slate-500/15 text-slate-400'}`}>
        {status}
      </span>
    );
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-navy-800 border border-white/10 rounded-xl px-5 py-3 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Members</h1>
          <p className="text-sm text-slate-400 mt-1">{members.length} total members</p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Invite Member
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          placeholder="Search members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-sm bg-navy-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
        />
      </div>

      {/* Table */}
      <div className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-slate-400 uppercase tracking-wide">
                <th className="text-left px-6 py-3.5 font-medium">Member</th>
                <th className="text-left px-6 py-3.5 font-medium">Campus</th>
                <th className="text-left px-6 py-3.5 font-medium">Role</th>
                <th className="text-left px-6 py-3.5 font-medium">Status</th>
                <th className="text-left px-6 py-3.5 font-medium">Joined</th>
                <th className="text-right px-6 py-3.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((__, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-white/5 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    {search ? 'No members match your search' : 'No members yet'}
                  </td>
                </tr>
              ) : filtered.map((m) => (
                <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-white">{m.displayName}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{m.email}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-300">{m.campus?.name ?? '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.isOrgAdmin ? 'bg-blue-500/15 text-blue-400' : 'bg-white/5 text-slate-400'}`}>
                      {m.isOrgAdmin ? 'Admin' : 'Member'}
                    </span>
                  </td>
                  <td className="px-6 py-4">{statusBadge(m.accountStatus)}</td>
                  <td className="px-6 py-4 text-slate-400">{fmt(m.createdAt)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(m)}
                        className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDelete(m)}
                        className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-all"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Member">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="jane@church.org"
              className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Campus</label>
            <select
              value={inviteCampus}
              onChange={(e) => setInviteCampus(e.target.value)}
              className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              <option value="">No campus assigned</option>
              {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="invite-admin"
              checked={inviteRole === 'admin'}
              onChange={(e) => setInviteRole(e.target.checked ? 'admin' : 'member')}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <label htmlFor="invite-admin" className="text-sm text-slate-300">Grant admin access</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setInviteOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={handleInvite}
              disabled={saving || !inviteEmail || !inviteName}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all"
            >
              {saving ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editMember} onClose={() => setEditMember(null)} title={`Edit — ${editMember?.displayName}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Campus</label>
            <select
              value={editCampus}
              onChange={(e) => setEditCampus(e.target.value)}
              className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              <option value="">No campus</option>
              {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="edit-admin"
              checked={editAdmin}
              onChange={(e) => setEditAdmin(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <label htmlFor="edit-admin" className="text-sm text-slate-300">Admin access</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setEditMember(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm delete modal */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Remove Member" size="sm">
        <p className="text-sm text-slate-300 mb-6">
          Remove <strong className="text-white">{confirmDelete?.displayName}</strong> from your organization? This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={handleDelete}
            disabled={saving}
            className="px-5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all"
          >
            {saving ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </Modal>
    </main>
  );
}
