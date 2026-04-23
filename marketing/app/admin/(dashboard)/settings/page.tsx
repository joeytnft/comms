'use client';

import { useEffect, useState, useCallback } from 'react';

interface OrgSettings {
  id: string;
  name: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  memberCount?: number;
  memberLimit?: number;
  createdAt: string;
}

interface Profile {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
}

const TIER_STYLES: Record<string, string> = {
  FREE: 'bg-slate-500/15 text-slate-400',
  STARTER: 'bg-blue-500/15 text-blue-400',
  TEAM: 'bg-emerald-500/15 text-emerald-400',
  PRO: 'bg-amber-500/15 text-amber-400',
};

export default function SettingsPage() {
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // Org edit
  const [orgName, setOrgName] = useState('');

  // Profile edit
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, profileRes] = await Promise.all([
        fetch('/api/admin/proxy/subscription'),
        fetch('/api/admin/proxy/users/me'),
      ]);
      const subData = subRes.ok ? await subRes.json() : {};
      const profileData = profileRes.ok ? await profileRes.json() : {};

      const p = profileData.user ?? profileData;
      const orgFromProfile = profileData.organization ?? {};
      setOrg({
        id: orgFromProfile.id ?? '',
        name: orgFromProfile.name ?? '',
        subscriptionTier: subData.subscription?.tier ?? 'FREE',
        subscriptionStatus: subData.subscription?.status ?? 'active',
        memberCount: subData.subscription?.usage?.members,
        memberLimit: subData.subscription?.limits?.members,
        createdAt: '',
      });
      setOrgName(orgFromProfile.name ?? '');

      setProfile(p);
      setDisplayName(p.displayName ?? '');
      setPhone(p.phone ?? '');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveOrg = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/proxy/organizations/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName }),
      });
      if (!res.ok) { showToast('Failed to update organization'); return; }
      showToast('Organization updated');
      fetchData();
    } finally { setSaving(false); }
  };

  const handleSaveProfile = async () => {
    if (newPassword && newPassword !== confirmPassword) {
      showToast('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = { displayName, phone };
      if (newPassword) { body.currentPassword = currentPassword; body.newPassword = newPassword; }

      const res = await fetch('/api/admin/proxy/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.message ?? 'Failed to update profile'); return; }
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      showToast('Profile updated');
      fetchData();
    } finally { setSaving(false); }
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

  if (loading) {
    return (
      <main className="flex-1 p-8">
        <div className="h-8 bg-white/5 rounded w-32 mb-8 animate-pulse" />
        <div className="space-y-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-navy-900 border border-white/10 rounded-2xl p-6 animate-pulse">
              <div className="h-5 bg-white/5 rounded w-40 mb-5" />
              <div className="space-y-3">
                <div className="h-4 bg-white/5 rounded w-full" />
                <div className="h-4 bg-white/5 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-8 max-w-3xl">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-navy-800 border border-white/10 rounded-xl px-5 py-3 text-sm text-white shadow-xl">{toast}</div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Manage your organization and account settings</p>
      </div>

      {/* Organization */}
      <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-5">Organization</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Organization Name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-slate-400">
              Created {fmt(org?.createdAt)}
            </div>
            <button
              onClick={handleSaveOrg}
              disabled={saving || !orgName || orgName === org?.name}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Subscription */}
      <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-5">Subscription</h2>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className={`text-sm font-semibold px-3 py-1 rounded-full ${TIER_STYLES[org?.subscriptionTier ?? 'FREE'] ?? 'bg-slate-500/15 text-slate-400'}`}>
              {org?.subscriptionTier ?? 'FREE'}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${org?.subscriptionStatus === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
              {org?.subscriptionStatus ?? 'TRIALING'}
            </span>
          </div>
          <a
            href="https://gathersafeapp.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Upgrade plan →
          </a>
        </div>
        {org?.memberLimit && (
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-slate-400">Members</span>
              <span className="text-slate-300">{org.memberCount ?? 0} / {org.memberLimit}</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((org.memberCount ?? 0) / org.memberLimit) * 100)}%` }}
              />
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500 mt-3">
          Manage your subscription through the GatherSafe mobile app or contact support.
        </p>
      </div>

      {/* Admin profile */}
      <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-5">Your Profile</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Display Name</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
            <input type="email" value={profile?.email ?? ''} disabled className="w-full bg-navy-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed" />
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <button onClick={handleSaveProfile} disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all">
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-navy-900 border border-white/10 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-white mb-5">Change Password</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Current Password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSaveProfile}
            disabled={saving || !currentPassword || !newPassword || newPassword !== confirmPassword}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all"
          >
            {saving ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </div>
    </main>
  );
}
