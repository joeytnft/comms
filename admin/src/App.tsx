import React, { useState } from 'react';
import { getAccessToken } from './api/client';
import { LoginPage } from './pages/LoginPage';
import { GeofencePage } from './pages/GeofencePage';
import { User } from './types';

export function App() {
  // If we already have a token, show the geofence page and let the API kick us out on 401
  const [user, setUser] = useState<User | null>(() => {
    const token = getAccessToken();
    if (!token) return null;
    try {
      // Decode payload from JWT (no signature verification — server handles that)
      const payload = JSON.parse(atob(token.split('.')[1]));
      // We only have userId/organizationId in the JWT payload; the full user object
      // is fetched lazily if needed. Provide a minimal stub so the page can load.
      return { id: payload.userId, organizationId: payload.organizationId } as unknown as User;
    } catch {
      return null;
    }
  });

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return <GeofencePage user={user} onLogout={() => setUser(null)} />;
}
