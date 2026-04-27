'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

export interface Geofence {
  id: string;
  campusId: string;
  name: string;
  type: 'circle' | 'polygon';
  latitude: number;
  longitude: number;
  radius: number;
  polygon: number[][] | null;
}

interface Props {
  geofence: Geofence | null;
  mapboxToken: string;
  onPolygonChange: (ring: number[][] | null) => void;
}

function geofenceToFeature(gf: Geofence): GeoJSON.Feature<GeoJSON.Polygon> | null {
  if (gf.type === 'polygon' && gf.polygon && gf.polygon.length >= 3) {
    const ring = gf.polygon;
    const closed =
      ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? ring
        : [...ring, ring[0]];
    return { type: 'Feature', id: gf.id, properties: {}, geometry: { type: 'Polygon', coordinates: [closed] } };
  }
  if (gf.type === 'circle') {
    const points = 64;
    const coords: number[][] = [];
    const R = 6_371_000;
    const lat0 = (gf.latitude * Math.PI) / 180;
    const lng0 = (gf.longitude * Math.PI) / 180;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const d = gf.radius / R;
      const lat = Math.asin(Math.sin(lat0) * Math.cos(d) + Math.cos(lat0) * Math.sin(d) * Math.cos(angle));
      const lng = lng0 + Math.atan2(Math.sin(angle) * Math.sin(d) * Math.cos(lat0), Math.cos(d) - Math.sin(lat0) * Math.sin(lat));
      coords.push([(lng * 180) / Math.PI, (lat * 180) / Math.PI]);
    }
    return { type: 'Feature', id: gf.id, properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
  }
  return null;
}

export function GeofenceMapDrawer({ geofence, mapboxToken, onPolygonChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);

  const reportChange = useCallback((draw: MapboxDraw) => {
    const all = draw.getAll();
    if (!all.features.length) { onPolygonChange(null); return; }
    const feature = all.features[0];
    if (feature.geometry.type === 'Polygon') {
      onPolygonChange(feature.geometry.coordinates[0] as number[][]);
    }
  }, [onPolygonChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: geofence ? [geofence.longitude, geofence.latitude] : [-98.5795, 39.8283],
      zoom: geofence ? 14 : 4,
    });

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: 'simple_select',
    });

    map.addControl(draw as unknown as mapboxgl.IControl);
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;
    drawRef.current = draw;

    map.on('load', () => {
      if (geofence) {
        const feature = geofenceToFeature(geofence);
        if (feature) {
          draw.add(feature);
          const bounds = new mapboxgl.LngLatBounds();
          (feature.geometry.coordinates[0] as number[][]).forEach(([lng, lat]) => bounds.extend([lng, lat]));
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, duration: 0 });
        }
      }
    });

    map.on('draw.create', () => reportChange(draw));
    map.on('draw.update', () => reportChange(draw));
    map.on('draw.delete', () => reportChange(draw));

    return () => { map.remove(); mapRef.current = null; drawRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevGeofenceId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const draw = drawRef.current;
    const map = mapRef.current;
    if (!draw || !map) return;
    const newId = geofence?.id ?? null;
    if (newId === prevGeofenceId.current) return;
    prevGeofenceId.current = newId;

    draw.deleteAll();
    onPolygonChange(null);
    if (!geofence) return;

    const feature = geofenceToFeature(geofence);
    if (!feature) return;
    draw.add(feature);
    reportChange(draw);

    const fitBounds = () => {
      const bounds = new mapboxgl.LngLatBounds();
      (feature.geometry.coordinates[0] as number[][]).forEach(([lng, lat]) => bounds.extend([lng, lat]));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, duration: 600 });
    };
    if (!map.loaded()) map.once('load', fitBounds); else fitBounds();
  }, [geofence, onPolygonChange, reportChange]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
