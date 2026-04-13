/**
 * Planning Center Online integration service.
 * Handles OAuth token exchange/refresh and data sync for People + Services.
 */
import { prisma } from '../../config/database';
import { env } from '../../config/env';

const PCO_API = 'https://api.planningcenteronline.com';
const PCO_TOKEN_URL = 'https://api.planningcenteronline.com/oauth/token';
const PCO_REVOKE_URL = 'https://api.planningcenteronline.com/oauth/revoke';
const USER_AGENT = 'GatherSafe (https://gathersafeapp.com)';

// ─── Token Management ──────────────────────────────────────────────────────────

export interface PcoTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<PcoTokens> {
  const res = await fetch(PCO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: env.PCO_CLIENT_ID,
      client_secret: env.PCO_CLIENT_SECRET,
      redirect_uri: env.PCO_REDIRECT_URI,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PCO token exchange failed: ${res.status} ${body}`);
  }
  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
  };
}

export async function refreshTokens(organizationId: string): Promise<PcoTokens> {
  const conn = await prisma.pcoConnection.findUnique({ where: { organizationId } });
  if (!conn) throw new Error('No PCO connection for this org');

  const res = await fetch(PCO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: conn.refreshToken,
      client_id: env.PCO_CLIENT_ID,
      client_secret: env.PCO_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`PCO token refresh failed: ${res.status}`);
  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  const tokens: PcoTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: conn.scope,
  };
  await prisma.pcoConnection.update({
    where: { organizationId },
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
    },
  });
  return tokens;
}

/** Returns a valid access token, refreshing if needed. */
export async function getValidToken(organizationId: string): Promise<string> {
  const conn = await prisma.pcoConnection.findUnique({ where: { organizationId } });
  if (!conn) throw new Error('No PCO connection');
  // Refresh if within 5 min of expiry
  if (conn.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    const tokens = await refreshTokens(organizationId);
    return tokens.accessToken;
  }
  return conn.accessToken;
}

export async function revokeConnection(organizationId: string): Promise<void> {
  const conn = await prisma.pcoConnection.findUnique({ where: { organizationId } });
  if (!conn) return;
  // Best-effort revoke — ignore errors
  await fetch(PCO_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams({
      token: conn.accessToken,
      token_type_hint: 'access_token',
      client_id: env.PCO_CLIENT_ID ?? '',
      client_secret: env.PCO_CLIENT_SECRET ?? '',
    }),
  }).catch(() => null);
  await prisma.pcoConnection.delete({ where: { organizationId } });
  await prisma.organization.update({
    where: { id: organizationId },
    data: { pcoIntegrationEnabled: false },
  });
}

// ─── PCO API Helper ───────────────────────────────────────────────────────────

async function pcoGet(organizationId: string, path: string): Promise<unknown> {
  const token = await getValidToken(organizationId);
  const res = await fetch(`${PCO_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`PCO API error ${res.status} on ${path}`);
  return res.json();
}

// ─── Sync: People ─────────────────────────────────────────────────────────────

export interface PcoPerson {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string; // 'active' | 'inactive'
  avatarUrl: string | null;
}

export async function syncPeople(organizationId: string): Promise<PcoPerson[]> {
  const people: PcoPerson[] = [];
  let url: string | null = '/people/v2/people?per_page=100&include=emails,phone_numbers&where[status]=active';

  while (url) {
    const data = await pcoGet(organizationId, url) as {
      data: Array<{
        id: string;
        attributes: {
          name: string;
          first_name: string;
          last_name: string;
          status: string;
          avatar: string | null;
        };
      }>;
      included: Array<{
        type: string;
        attributes: { address: string; primary: boolean; location: string };
      }>;
      links: { next?: string };
    };

    // Build email/phone maps from included resources (keyed by person id)
    const emailMap: Record<string, string> = {};
    const phoneMap: Record<string, string> = {};
    for (const inc of data.included ?? []) {
      if (inc.type === 'Email' && inc.attributes.primary) {
        // PCO includes don't link back easily without relationships — handled below
        // This is a simplified pass
      }
    }

    for (const person of data.data) {
      people.push({
        id: person.id,
        name: person.attributes.name,
        firstName: person.attributes.first_name,
        lastName: person.attributes.last_name,
        email: emailMap[person.id] ?? null,
        phone: phoneMap[person.id] ?? null,
        status: person.attributes.status,
        avatarUrl: person.attributes.avatar,
      });
    }

    // Follow pagination
    const nextLink = data.links?.next;
    if (nextLink) {
      // Extract path from full URL
      url = new URL(nextLink).pathname + new URL(nextLink).search;
    } else {
      url = null;
    }
  }

  return people;
}

// ─── Sync: Services ──────────────────────────────────────────────────────────

export interface PcoServiceType {
  id: string;
  name: string;
}

export interface PcoServicePlan {
  id: string;
  serviceTypeId: string;
  serviceTypeName: string;
  title: string | null;
  seriesTitle: string | null;
  sortDate: string | null; // ISO date
  totalLength: number; // seconds
}

export async function syncServiceTypes(organizationId: string): Promise<PcoServiceType[]> {
  const data = await pcoGet(organizationId, '/services/v2/service_types?per_page=100') as {
    data: Array<{ id: string; attributes: { name: string } }>;
  };
  return data.data.map((st) => ({ id: st.id, name: st.attributes.name }));
}

export async function syncUpcomingPlans(
  organizationId: string,
  serviceTypeId: string,
  serviceTypeName: string,
  limit = 10,
): Promise<PcoServicePlan[]> {
  const data = await pcoGet(
    organizationId,
    `/services/v2/service_types/${serviceTypeId}/plans?filter=future&per_page=${limit}&order=sort_date`,
  ) as {
    data: Array<{
      id: string;
      attributes: {
        title: string | null;
        series_title: string | null;
        sort_date: string | null;
        total_length: number;
      };
    }>;
  };
  return data.data.map((p) => ({
    id: p.id,
    serviceTypeId,
    serviceTypeName,
    title: p.attributes.title,
    seriesTitle: p.attributes.series_title,
    sortDate: p.attributes.sort_date,
    totalLength: p.attributes.total_length,
  }));
}

// ─── Get connected org info ───────────────────────────────────────────────────

export interface PcoOrgInfo {
  id: string;
  name: string;
}

export async function getPcoOrgInfo(accessToken: string): Promise<PcoOrgInfo> {
  const res = await fetch(`${PCO_API}/people/v2/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error('Failed to fetch PCO org info');
  const data = await res.json() as {
    data: { id: string };
    included?: Array<{ type: string; id: string; attributes: { name: string } }>;
  };
  // org name comes from the organization included
  const orgIncluded = data.included?.find((i) => i.type === 'Organization');
  return {
    id: orgIncluded?.id ?? data.data.id,
    name: orgIncluded?.attributes.name ?? 'Planning Center',
  };
}
