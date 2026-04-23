'use client';

import { useEffect, useState, useCallback } from 'react';

interface PcoConnection {
  id: string;
  connected: boolean;
  organizationName?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  syncStatus?: 'IDLE' | 'SYNCING' | 'ERROR';
  syncError?: string;
  personCount?: number;
  planCount?: number;
  teamCount?: number;
}

interface PcoPerson {
  id: string;
  name: string;
  email?: string;
  status: string;
  matchedUserId?: string;
}

export default function PlanningCenterPage() {
  const [connection, setConnection] = useState<PcoConnection | null>(null);
  const [people, setPeople] = useState<PcoPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [toast, setToast] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'people'>('overview');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const fetchConnection = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/proxy/integrations/pco/status');
      if (res.ok) {
        const data = await res.json();
        setConnection({
          id: '',
          connected: !!data.connected,
          organizationName: data.pcoOrgName ?? undefined,
          connectedAt: data.connectedAt ?? undefined,
          lastSyncAt: data.lastSyncAt ?? undefined,
          syncStatus: 'IDLE',
        });
        if (data.connected) {
          const pplRes = await fetch('/api/admin/proxy/integrations/pco/people');
          if (pplRes.ok) {
            const pplData = await pplRes.json();
            const pplList = Array.isArray(pplData.people) ? pplData.people : [];
            setPeople(pplList);
            setConnection((prev) => prev ? { ...prev, personCount: pplList.length } : prev);
          }
        }
      } else {
        setConnection({ id: '', connected: false });
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchConnection(); }, [fetchConnection]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/admin/proxy/integrations/pco/connect', { method: 'POST' });
      const data = res.ok ? await res.json() : {};
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        showToast('Failed to start OAuth flow');
      }
    } finally { setConnecting(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/proxy/integrations/pco/sync/people', { method: 'POST' });
      if (res.ok) { showToast('Sync started — this may take a moment'); fetchConnection(); }
      else { showToast('Sync failed'); }
    } finally { setSyncing(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Planning Center? Synced data will remain but future syncs will stop.')) return;
    await fetch('/api/admin/proxy/integrations/pco/disconnect', { method: 'DELETE' });
    showToast('Disconnected'); fetchConnection();
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  if (loading) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="h-8 bg-white/5 rounded w-48 mb-8 animate-pulse" />
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-8 animate-pulse">
          <div className="h-6 bg-white/5 rounded w-64 mb-4" />
          <div className="h-4 bg-white/5 rounded w-96" />
        </div>
      </main>
    );
  }

  const isConnected = connection?.connected;

  return (
    <main className="flex-1 p-8">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-navy-800 border border-white/10 rounded-xl px-5 py-3 text-sm text-white shadow-xl">{toast}</div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Planning Center</h1>
        <p className="text-sm text-slate-400 mt-1">Sync volunteers and schedules from Planning Center Online</p>
      </div>

      {/* Connection card */}
      <div className={`bg-navy-900 border rounded-2xl p-6 mb-6 ${isConnected ? 'border-emerald-500/30' : 'border-white/10'}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isConnected ? 'bg-emerald-600/15' : 'bg-white/5'}`}>
              <svg className={`w-6 h-6 ${isConnected ? 'text-emerald-400' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-base font-semibold text-white">Planning Center Online</h2>
                {isConnected ? (
                  <span className="text-xs font-medium bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">Connected</span>
                ) : (
                  <span className="text-xs font-medium bg-white/5 text-slate-400 px-2 py-0.5 rounded-full">Not connected</span>
                )}
              </div>
              {isConnected && connection.organizationName && (
                <p className="text-sm text-slate-400">{connection.organizationName}</p>
              )}
              {!isConnected && (
                <p className="text-sm text-slate-400">Connect to sync volunteers, teams, and schedules</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isConnected ? (
              <>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-xl transition-all"
                >
                  {syncing ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                  )}
                  {syncing ? 'Syncing…' : 'Sync Now'}
                </button>
                <button onClick={handleDisconnect} className="text-sm text-red-400 hover:text-red-300 px-4 py-2 rounded-xl hover:bg-red-500/10 transition-all border border-red-500/20">Disconnect</button>
              </>
            ) : (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20"
              >
                {connecting ? 'Connecting…' : 'Connect Planning Center'}
              </button>
            )}
          </div>
        </div>

        {/* Sync info */}
        {isConnected && (
          <div className="mt-5 pt-5 border-t border-white/5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Connected</p>
              <p className="text-slate-200">{fmt(connection.connectedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Last Sync</p>
              <p className="text-slate-200">{fmt(connection.lastSyncAt)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">People Synced</p>
              <p className="text-slate-200">{connection.personCount ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Plans Synced</p>
              <p className="text-slate-200">{connection.planCount ?? 0}</p>
            </div>
          </div>
        )}

        {connection?.syncStatus === 'ERROR' && connection.syncError && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            Sync error: {connection.syncError}
          </div>
        )}
      </div>

      {/* People table */}
      {isConnected && (
        <>
          <div className="flex items-center gap-1 mb-4 bg-navy-900 border border-white/10 rounded-xl p-1 w-fit">
            {(['overview', 'people'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'People', count: connection.personCount ?? 0, icon: '👤' },
                { label: 'Plans', count: connection.planCount ?? 0, icon: '📋' },
                { label: 'Teams', count: connection.teamCount ?? 0, icon: '👥' },
              ].map((item) => (
                <div key={item.label} className="bg-navy-900 border border-white/10 rounded-2xl p-5 text-center">
                  <p className="text-3xl mb-2">{item.icon}</p>
                  <p className="text-2xl font-bold text-white">{item.count}</p>
                  <p className="text-sm text-slate-400">{item.label}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'people' && (
            <div className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-slate-400 uppercase tracking-wide">
                      <th className="text-left px-6 py-3.5 font-medium">Name</th>
                      <th className="text-left px-6 py-3.5 font-medium">Email</th>
                      <th className="text-left px-6 py-3.5 font-medium">PCO Status</th>
                      <th className="text-left px-6 py-3.5 font-medium">GatherSafe Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {people.length === 0 ? (
                      <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-500">No people synced yet. Run a sync to import.</td></tr>
                    ) : people.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 font-medium text-white">{p.name}</td>
                        <td className="px-6 py-4 text-slate-400">{p.email ?? '—'}</td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-medium bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full">{p.status}</span>
                        </td>
                        <td className="px-6 py-4">
                          {p.matchedUserId ? (
                            <span className="text-xs font-medium bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">Matched</span>
                          ) : (
                            <span className="text-xs text-slate-500">No match</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Not connected empty state */}
      {!isConnected && (
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-white mb-2">Connect Planning Center</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto mb-6">
            Sync your volunteer roster, service schedules, and team assignments directly from Planning Center Online.
          </p>
          <ul className="text-sm text-slate-400 space-y-2 text-left max-w-xs mx-auto mb-6">
            {['Import volunteers automatically', 'Sync service schedules', 'Match PCO people to GatherSafe members', 'Keep rosters in sync'].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                {f}
              </li>
            ))}
          </ul>
          <button onClick={handleConnect} disabled={connecting} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all">
            {connecting ? 'Connecting…' : 'Connect Now'}
          </button>
        </div>
      )}
    </main>
  );
}
