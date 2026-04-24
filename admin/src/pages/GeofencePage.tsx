import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, clearTokens } from '../api/client';
import { MapDrawer } from '../components/MapDrawer';
import { Campus, Geofence, Organization, User } from '../types';

interface Props {
  user: User;
  onLogout: () => void;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function GeofencePage({ user, onLogout }: Props) {
  const [org, setOrg] = useState<Organization | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState<string>('');
  const [geofenceName, setGeofenceName] = useState('');
  const [drawnPolygon, setDrawnPolygon] = useState<number[][] | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedCampus = campuses.find((c) => c.id === selectedCampusId) ?? null;
  const existingGeofence: Geofence | null = selectedCampus?.geofence ?? null;

  // Load org + campuses on mount
  useEffect(() => {
    (async () => {
      try {
        const [orgData, campusData] = await Promise.all([
          apiFetch<{ organization: Organization }>('/organizations/me'),
          apiFetch<{ campuses: Campus[] }>('/organizations/me/campuses'),
        ]);
        setOrg(orgData.organization);
        setCampuses(campusData.campuses);
        if (campusData.campuses.length > 0) {
          const first = campusData.campuses[0];
          setSelectedCampusId(first.id);
          setGeofenceName(first.geofence?.name ?? first.name);
        }
      } catch (err) {
        setLoadError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // When campus changes, pre-fill name from existing geofence
  useEffect(() => {
    const campus = campuses.find((c) => c.id === selectedCampusId);
    if (campus) {
      setGeofenceName(campus.geofence?.name ?? campus.name);
    }
    setDrawnPolygon(null);
    setSaveState('idle');
    setSaveError('');
    setDeleteConfirm(false);
  }, [selectedCampusId, campuses]);

  const handlePolygonChange = useCallback((ring: number[][] | null) => {
    setDrawnPolygon(ring);
    setSaveState('idle');
  }, []);

  const handleSave = async () => {
    if (!selectedCampusId) return;
    if (!geofenceName.trim()) {
      setSaveError('Enter a geofence name.');
      return;
    }
    if (!drawnPolygon || drawnPolygon.length < 3) {
      setSaveError('Draw a polygon on the map first.');
      return;
    }

    setSaveState('saving');
    setSaveError('');

    try {
      const result = await apiFetch<{ geofence: Geofence }>('/geofence', {
        method: 'PUT',
        body: JSON.stringify({
          campusId: selectedCampusId,
          name: geofenceName.trim(),
          type: 'polygon',
          polygon: drawnPolygon,
        }),
      });

      // Update local campus list with the new geofence
      setCampuses((prev) =>
        prev.map((c) =>
          c.id === selectedCampusId ? { ...c, geofence: result.geofence } : c,
        ),
      );
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      setSaveError((err as Error).message);
      setSaveState('error');
    }
  };

  const handleDelete = async () => {
    if (!selectedCampusId) return;

    try {
      await apiFetch(`/geofence?campusId=${selectedCampusId}`, { method: 'DELETE' });
      setCampuses((prev) =>
        prev.map((c) => (c.id === selectedCampusId ? { ...c, geofence: null } : c)),
      );
      setDrawnPolygon(null);
      setSaveState('idle');
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setDeleteConfirm(false);
    }
  };

  const handleLogout = () => {
    clearTokens();
    onLogout();
  };

  if (loading) {
    return (
      <div style={styles.centered}>
        <p style={styles.hint}>Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={styles.centered}>
        <p style={styles.errorText}>{loadError}</p>
        <button style={styles.btnDanger} onClick={handleLogout}>Sign Out</button>
      </div>
    );
  }

  if (campuses.length === 0) {
    return (
      <div style={styles.centered}>
        <p style={styles.hint}>No campuses found. Create a campus in the GatherSafe mobile app first.</p>
        <button style={styles.btnDanger} onClick={handleLogout}>Sign Out</button>
      </div>
    );
  }

  const canSave = !!drawnPolygon && drawnPolygon.length >= 3 && geofenceName.trim().length > 0;

  return (
    <div style={styles.shell}>
      {/* Top bar */}
      <header style={styles.topbar}>
        <div style={styles.topbarLeft}>
          <span style={styles.logoText}>GatherSafe</span>
          <span style={styles.logoBadge}>Admin</span>
          {org && <span style={styles.orgName}>{org.name}</span>}
        </div>
        <div style={styles.topbarRight}>
          <span style={styles.userLabel}>{user.email}</span>
          <button style={styles.btnGhost} onClick={handleLogout}>Sign Out</button>
        </div>
      </header>

      <div style={styles.body}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <h2 style={styles.sidebarTitle}>Geofence Editor</h2>
          <p style={styles.hint}>
            Draw a custom polygon to define your campus boundary. The mobile team map will show this geofence immediately after saving.
          </p>

          {/* Campus selector */}
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Campus</label>
            <select
              value={selectedCampusId}
              onChange={(e) => setSelectedCampusId(e.target.value)}
              style={styles.select}
            >
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.geofence ? ` ✓` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Geofence name */}
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Geofence Name</label>
            <input
              type="text"
              value={geofenceName}
              onChange={(e) => setGeofenceName(e.target.value)}
              placeholder="e.g. Main Campus Boundary"
              style={styles.input}
            />
          </div>

          {/* Status indicator */}
          {existingGeofence && (
            <div style={styles.statusBox}>
              <span style={styles.statusDot} />
              <span style={styles.statusText}>
                Active geofence: <strong>{existingGeofence.name}</strong>
                {' '}({existingGeofence.type})
              </span>
            </div>
          )}

          {/* Draw instructions */}
          <div style={styles.instructions}>
            <p style={styles.instructionTitle}>How to draw</p>
            <ol style={styles.instructionList}>
              <li>Click the polygon tool (▲) in the map toolbar</li>
              <li>Click to place each corner of your boundary</li>
              <li>Double-click or click the first point to close the shape</li>
              <li>Use the trash icon to clear and redraw</li>
              <li>Enter a name above, then click Save</li>
            </ol>
          </div>

          {saveError && <div style={styles.errorBox}>{saveError}</div>}

          {/* Save button */}
          <button
            style={{ ...styles.btnPrimary, ...(!canSave || saveState === 'saving' ? styles.btnDisabled : {}) }}
            onClick={handleSave}
            disabled={!canSave || saveState === 'saving'}
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved!' : 'Save Geofence'}
          </button>

          {/* Delete */}
          {existingGeofence && !deleteConfirm && (
            <button style={styles.btnDanger} onClick={() => setDeleteConfirm(true)}>
              Delete Geofence
            </button>
          )}
          {deleteConfirm && (
            <div style={styles.confirmBox}>
              <p style={styles.confirmText}>Delete this geofence permanently?</p>
              <div style={styles.confirmRow}>
                <button style={styles.btnDanger} onClick={handleDelete}>Yes, Delete</button>
                <button style={styles.btnGhost} onClick={() => setDeleteConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </aside>

        {/* Map */}
        <div style={styles.mapContainer}>
          <MapDrawer key={selectedCampusId} geofence={existingGeofence} onPolygonChange={handlePolygonChange} />
          {drawnPolygon && drawnPolygon.length >= 3 && (
            <div style={styles.mapBadge}>
              {drawnPolygon.length - 1} points — ready to save
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0f1117',
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: '52px',
    background: '#1a1d27',
    borderBottom: '1px solid #2d3148',
    flexShrink: 0,
  },
  topbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  topbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoText: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  logoBadge: {
    background: '#3b82f6',
    color: '#fff',
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: '100px',
    letterSpacing: '0.05em',
  },
  orgName: {
    fontSize: '13px',
    color: '#64748b',
    marginLeft: '4px',
  },
  userLabel: {
    fontSize: '13px',
    color: '#64748b',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: '320px',
    flexShrink: 0,
    background: '#1a1d27',
    borderRight: '1px solid #2d3148',
    padding: '24px 20px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sidebarTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#f1f5f9',
  },
  hint: {
    fontSize: '13px',
    color: '#64748b',
    lineHeight: 1.6,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  select: {
    background: '#0f1117',
    border: '1px solid #2d3148',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#f1f5f9',
    fontSize: '14px',
    cursor: 'pointer',
  },
  input: {
    background: '#0f1117',
    border: '1px solid #2d3148',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#f1f5f9',
    fontSize: '14px',
    outline: 'none',
  },
  statusBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: '#14532d20',
    border: '1px solid #22c55e40',
    borderRadius: '8px',
    padding: '10px 12px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#22c55e',
    flexShrink: 0,
  },
  statusText: {
    fontSize: '12px',
    color: '#86efac',
  },
  instructions: {
    background: '#0f1117',
    border: '1px solid #2d3148',
    borderRadius: '8px',
    padding: '14px',
  },
  instructionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '10px',
  },
  instructionList: {
    paddingLeft: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  errorBox: {
    background: '#7f1d1d30',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#fca5a5',
    fontSize: '13px',
  },
  btnPrimary: {
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDanger: {
    background: '#7f1d1d',
    color: '#fca5a5',
    border: '1px solid #ef444450',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnGhost: {
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid #2d3148',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  confirmBox: {
    background: '#1e1b2e',
    border: '1px solid #ef444450',
    borderRadius: '8px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  confirmText: {
    fontSize: '13px',
    color: '#fca5a5',
  },
  confirmRow: {
    display: 'flex',
    gap: '8px',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  mapBadge: {
    position: 'absolute',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#1a1d27e0',
    border: '1px solid #3b82f6',
    borderRadius: '100px',
    padding: '6px 14px',
    fontSize: '12px',
    color: '#93c5fd',
    fontWeight: 600,
    pointerEvents: 'none',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
    padding: '24px',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: '14px',
  },
};
