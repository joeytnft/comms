'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stats {
  memberCount: number;
  campusCount: number;
  openIncidents: number;
  upcomingTrainings: number;
  pendingDocuments: number;
  activeAlerts: number;
}

interface RecentIncident {
  id: string;
  title: string;
  createdAt: string;
  status?: string;
}

interface UpcomingTraining {
  id: string;
  title: string;
  scheduledAt: string;
  status: string;
}

function StatCard({
  label,
  value,
  icon,
  href,
  accent = 'blue',
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  href: string;
  accent?: 'blue' | 'emerald' | 'amber' | 'red';
}) {
  const accents = {
    blue: 'bg-blue-600/15 text-blue-400',
    emerald: 'bg-emerald-600/15 text-emerald-400',
    amber: 'bg-amber-500/15 text-amber-400',
    red: 'bg-red-500/15 text-red-400',
  };
  return (
    <Link
      href={href}
      className="bg-navy-900 border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accents[accent]}`}>
          {icon}
        </div>
        <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </div>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-slate-400">{label}</p>
    </Link>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [incidents, setIncidents] = useState<RecentIncident[]>([]);
  const [trainings, setTrainings] = useState<UpcomingTraining[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [usersRes, campusRes, incidentRes, trainingRes] = await Promise.allSettled([
          fetch('/api/admin/proxy/users/org-members'),
          fetch('/api/admin/proxy/campuses'),
          fetch('/api/admin/proxy/incidents?limit=5'),
          fetch('/api/admin/proxy/training?limit=5&status=SCHEDULED'),
        ]);

        const users = usersRes.status === 'fulfilled' && usersRes.value.ok ? await usersRes.value.json() : {};
        const campuses = campusRes.status === 'fulfilled' && campusRes.value.ok ? await campusRes.value.json() : {};
        const incidentData = incidentRes.status === 'fulfilled' && incidentRes.value.ok ? await incidentRes.value.json() : {};
        const trainingData = trainingRes.status === 'fulfilled' && trainingRes.value.ok ? await trainingRes.value.json() : {};

        setStats({
          memberCount: Array.isArray(users.members) ? users.members.length : 0,
          campusCount: Array.isArray(campuses.campuses) ? campuses.campuses.length : (Array.isArray(campuses) ? campuses.length : 0),
          openIncidents: incidentData.total ?? (Array.isArray(incidentData.incidents) ? incidentData.incidents.length : 0),
          upcomingTrainings: trainingData.total ?? (Array.isArray(trainingData.trainings) ? trainingData.trainings.length : 0),
          pendingDocuments: 0,
          activeAlerts: 0,
        });

        setIncidents(Array.isArray(incidentData.incidents) ? incidentData.incidents.slice(0, 5) : []);
        setTrainings(Array.isArray(trainingData.trainings) ? trainingData.trainings.slice(0, 5) : []);
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <main className="flex-1 p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Overview of your organization</p>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-navy-900 border border-white/10 rounded-2xl p-6 animate-pulse">
              <div className="w-10 h-10 bg-white/5 rounded-xl mb-4" />
              <div className="h-8 bg-white/5 rounded w-16 mb-2" />
              <div className="h-4 bg-white/5 rounded w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Members"
            value={stats?.memberCount ?? 0}
            href="/admin/members"
            accent="blue"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            }
          />
          <StatCard
            label="Campuses"
            value={stats?.campusCount ?? 0}
            href="/admin/campuses"
            accent="emerald"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
            }
          />
          <StatCard
            label="Open Incidents"
            value={stats?.openIncidents ?? 0}
            href="/admin/incidents"
            accent="amber"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            }
          />
          <StatCard
            label="Upcoming Trainings"
            value={stats?.upcomingTrainings ?? 0}
            href="/admin/training"
            accent="blue"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            }
          />
        </div>
      )}

      {/* Bottom panels */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent incidents */}
        <div className="bg-navy-900 border border-white/10 rounded-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white">Recent Incidents</h2>
            <Link href="/admin/incidents" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View all</Link>
          </div>
          <div className="divide-y divide-white/5">
            {incidents.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-500 text-center">No incidents recorded</p>
            ) : incidents.map((inc) => (
              <div key={inc.id} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-sm text-slate-200 truncate">{inc.title}</p>
                </div>
                <span className="text-xs text-slate-500 shrink-0 ml-4">{fmt(inc.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming trainings */}
        <div className="bg-navy-900 border border-white/10 rounded-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white">Upcoming Trainings</h2>
            <Link href="/admin/training" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View all</Link>
          </div>
          <div className="divide-y divide-white/5">
            {trainings.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-500 text-center">No upcoming trainings</p>
            ) : trainings.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <p className="text-sm text-slate-200 truncate">{t.title}</p>
                </div>
                <span className="text-xs text-slate-500 shrink-0 ml-4">{fmt(t.scheduledAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-6 bg-navy-900 border border-white/10 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Invite Member', href: '/admin/members' },
            { label: 'Add Campus', href: '/admin/campuses' },
            { label: 'Create Training', href: '/admin/training' },
            { label: 'Upload Document', href: '/admin/documents' },
            { label: 'View Incidents', href: '/admin/incidents' },
          ].map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
