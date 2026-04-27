'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Geofence } from '@/components/admin/GeofenceMapDrawer';

// Mapbox GL must not run on the server
const GeofenceMapDrawer = dynamic(
  () => import('@/components/admin/GeofenceMapDrawer').then((m) => m.GeofenceMapDrawer),
  { ssr: false, loading: () => <div className="flex-1 bg-navy-900 animate-pulse" /> },
);

interface Campus {
  id: string;
  name: string;
  geofence: Geofence | null;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

export default function GeofencePage() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [geofenceName, setGeofenceName] = useState('');
  const [drawnPolygon, setDrawnPolygon] = useState<number[][] | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const selectedCampus = campuses.find((c) => c.id === selectedId) ?? null;
  const existingGeofence = selectedCampus?.geofence ?? null;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/proxy/organizations/me/campuses');
        if (!res.ok) throw new Error('Failed to load campuses');
        const data: { campuses: Campus[] } = await res.json();
        setCampuses(data.campuses ?? []);
        if (data.campuses?.length) {
          const first = data.campuses[0];
          setSelectedId(first.id);
          setGeofenceName(first.geofence?.name ?? first.name);
        }
      } catch (err) {
        setLoadError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const campus = campuses.find((c) => c.id === selectedId);
    if (campus) setGeofenceName(campus.geofence?.name ?? campus.name);
    setDrawnPolygon(null);
    setSaveState('idle');
    setSaveError('');
    setDeleteConfirm(false);
  }, [selectedId, campuses]);

  const handlePolygonChange = useCallback((ring: number[][] | null) => {
    setDrawnPolygon(ring);
    setSaveState('idle');
  }, []);

  const handleSave = async () => {
    if (!selectedId || !geofenceName.trim()) { setSaveError('Enter a geofence name.'); return; }
    if (!drawnPolygon || drawnPolygon.length < 3) { setSaveError('Draw a polygon on the map first.'); return; }
    setSaveState('saving');
    setSaveError('');
    try {
      const res = await fetch('/api/admin/proxy/geofence', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campusId: selectedId, name: geofenceName.trim(), type: 'polygon', polygon: drawnPolygon }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Save failed'); }
      const { geofence } = await res.json();
      setCampuses((prev) => prev.map((c) => c.id === selectedId ? { ...c, geofence } : c));
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      setSaveError((err as Error).message);
      setSaveState('error');
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/admin/proxy/geofence?campusId=${selectedId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Delete failed'); }
      setCampuses((prev) => prev.map((c) => c.id === selectedId ? { ...c, geofence: null } : c));
      setDrawnPolygon(null);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setDeleteConfirm(false);
    }
  };

  const canSave = !!drawnPolygon && drawnPolygon.length >= 3 && geofenceName.trim().length > 0;

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading campuses…</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-red-400">{loadError}</p>
      </main>
    );
  }

  if (campuses.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-slate-400">No campuses found. Create a campus first.</p>
      </main>
    );
  }

  if (!MAPBOX_TOKEN) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-red-400">
          Set <code className="text-red-300">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your environment to use the geofence editor.
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
      {/* Sidebar panel */}
      <aside className="w-full lg:w-80 shrink-0 bg-navy-900 border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col gap-5 p-6 overflow-y-auto">
        <div>
          <h1 className="text-xl font-bold text-white">Geofence Editor</h1>
          <p className="text-sm text-slate-400 mt-1">
            Draw a polygon boundary for your campus. The mobile team map reflects this immediately after saving.
          </p>
        </div>

        {/* Campus selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Campus</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          >
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.geofence ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Geofence name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Geofence Name</label>
          <input
            type="text"
            value={geofenceName}
            onChange={(e) => setGeofenceName(e.target.value)}
            placeholder="e.g. Main Campus Boundary"
            className="bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>

        {/* Active geofence status */}
        {existingGeofence && (
          <div className="flex items-center gap-2.5 bg-emerald-600/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-300">
              Active: <strong className="text-emerald-200">{existingGeofence.name}</strong>{' '}
              <span className="text-emerald-400/60">({existingGeofence.type})</span>
            </p>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-navy-800 border border-white/10 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">How to draw</p>
          <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
            <li>Click the polygon tool <span className="font-mono text-slate-300">▲</span> in the map toolbar</li>
            <li>Click to place each corner of your boundary</li>
            <li>Double-click or click the first point to close the shape</li>
            <li>Use the trash icon to clear and redraw</li>
            <li>Enter a name above, then click Save</li>
          </ol>
        </div>

        {saveError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {saveError}
          </div>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!canSave || saveState === 'saving'}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20"
        >
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved!' : 'Save Geofence'}
        </button>

        {/* Delete */}
        {existingGeofence && !deleteConfirm && (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="w-full text-sm text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-xl px-4 py-2.5 transition-all"
          >
            Delete Geofence
          </button>
        )}
        {deleteConfirm && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex flex-col gap-3">
            <p className="text-sm text-red-300">Delete this geofence permanently?</p>
            <div className="flex gap-3">
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all">
                Yes, Delete
              </button>
              <button onClick={() => setDeleteConfirm(false)} className="flex-1 border border-white/10 text-slate-400 hover:text-white text-sm px-4 py-2 rounded-xl transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Map */}
      <div className="flex-1 relative min-h-[400px] lg:min-h-0">
        <GeofenceMapDrawer
          key={selectedId}
          geofence={existingGeofence}
          mapboxToken={MAPBOX_TOKEN}
          onPolygonChange={handlePolygonChange}
        />
        {drawnPolygon && drawnPolygon.length >= 3 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-navy-900/90 border border-blue-500/40 rounded-full px-4 py-1.5 text-xs text-blue-300 font-semibold pointer-events-none backdrop-blur">
            {drawnPolygon.length - 1} points — ready to save
          </div>
        )}
      </div>
    </main>
  );
}
