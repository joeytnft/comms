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
  if (conn.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    const tokens = await refreshTokens(organizationId);
    return tokens.accessToken;
  }
  return conn.accessToken;
}

export async function revokeConnection(organizationId: string): Promise<void> {
  const conn = await prisma.pcoConnection.findUnique({ where: { organizationId } });
  if (!conn) return;
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
  status: string;
  avatarUrl: string | null;
}

type PcoJsonApiResource = {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data: { type: string; id: string } | Array<{ type: string; id: string }> }>;
};

export async function syncPeople(organizationId: string): Promise<PcoPerson[]> {
  const people: PcoPerson[] = [];
  let url: string | null = '/people/v2/people?per_page=100&include=emails,phone_numbers&where[status]=active';

  while (url) {
    const data = await pcoGet(organizationId, url) as {
      data: PcoJsonApiResource[];
      included: PcoJsonApiResource[];
      links: { next?: string };
    };

    // Build lookup maps for included resources by id
    const includedById: Record<string, PcoJsonApiResource> = {};
    for (const inc of data.included ?? []) {
      includedById[inc.id] = inc;
    }

    for (const person of data.data) {
      // Extract primary email via relationships → included lookup
      let email: string | null = null;
      const emailRels = person.relationships?.emails?.data;
      const emailIds = Array.isArray(emailRels) ? emailRels : (emailRels ? [emailRels] : []);
      for (const ref of emailIds) {
        const inc = includedById[ref.id];
        if (inc?.type === 'Email' && inc.attributes.primary) {
          email = inc.attributes.address as string;
          break;
        }
      }
      // Fall back to first email if none marked primary
      if (!email && emailIds.length > 0) {
        const inc = includedById[emailIds[0].id];
        if (inc) email = inc.attributes.address as string ?? null;
      }

      // Extract primary phone
      let phone: string | null = null;
      const phoneRels = person.relationships?.phone_numbers?.data;
      const phoneIds = Array.isArray(phoneRels) ? phoneRels : (phoneRels ? [phoneRels] : []);
      for (const ref of phoneIds) {
        const inc = includedById[ref.id];
        if (inc?.type === 'PhoneNumber' && inc.attributes.primary) {
          phone = inc.attributes.number as string;
          break;
        }
      }
      if (!phone && phoneIds.length > 0) {
        const inc = includedById[phoneIds[0].id];
        if (inc) phone = inc.attributes.number as string ?? null;
      }

      people.push({
        id: person.id,
        name: person.attributes.name as string,
        firstName: person.attributes.first_name as string,
        lastName: person.attributes.last_name as string,
        email,
        phone,
        status: person.attributes.status as string,
        avatarUrl: person.attributes.avatar as string | null,
      });
    }

    const nextLink = data.links?.next;
    if (nextLink) {
      url = new URL(nextLink).pathname + new URL(nextLink).search;
    } else {
      url = null;
    }
  }

  return people;
}

// ─── Sync: Teams ──────────────────────────────────────────────────────────────

export interface PcoTeam {
  id: string;
  serviceTypeId: string;
  serviceTypeName: string;
  name: string;
}

export interface PcoTeamMember {
  pcoTeamId: string;
  pcoPersonId: string;
}

export async function syncTeams(
  organizationId: string,
  serviceTypeId: string,
  serviceTypeName: string,
): Promise<{ teams: PcoTeam[]; members: PcoTeamMember[] }> {
  const data = await pcoGet(
    organizationId,
    `/services/v2/service_types/${serviceTypeId}/teams?per_page=100`,
  ) as { data: PcoJsonApiResource[] };

  const teams: PcoTeam[] = data.data.map((t) => ({
    id: t.id,
    serviceTypeId,
    serviceTypeName,
    name: t.attributes.name as string,
  }));

  const allMembers: PcoTeamMember[] = [];

  for (const team of teams) {
    let memberUrl: string | null =
      `/services/v2/service_types/${serviceTypeId}/teams/${team.id}/team_members?per_page=100&include=person`;

    while (memberUrl) {
      const memberData = await pcoGet(organizationId, memberUrl) as {
        data: PcoJsonApiResource[];
        links: { next?: string };
      };

      for (const tm of memberData.data) {
        const personRel = tm.relationships?.person?.data;
        if (personRel && !Array.isArray(personRel)) {
          allMembers.push({ pcoTeamId: team.id, pcoPersonId: personRel.id });
        }
      }

      const next = (memberData as { links?: { next?: string } }).links?.next;
      memberUrl = next ? new URL(next).pathname + new URL(next).search : null;
    }
  }

  return { teams, members: allMembers };
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
  sortDate: string | null;
  totalLength: number;
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

// ─── Sync: Plan People (who is scheduled on a given service) ─────────────────

export interface PcoScheduledPerson {
  pcoPlanId: string;
  pcoPersonId: string;
  pcoTeamId: string | null;
  status: string;
  position: string | null;
}

export async function syncPlanPeople(
  organizationId: string,
  serviceTypeId: string,
  planId: string,
): Promise<PcoScheduledPerson[]> {
  const scheduled: PcoScheduledPerson[] = [];
  let url: string | null =
    `/services/v2/service_types/${serviceTypeId}/plans/${planId}/plan_people?per_page=100`;

  while (url) {
    const data = await pcoGet(organizationId, url) as {
      data: PcoJsonApiResource[];
      links: { next?: string };
    };

    for (const pp of data.data) {
      const personRel = pp.relationships?.person?.data;
      const teamRel = pp.relationships?.team?.data;
      if (!personRel || Array.isArray(personRel)) continue;

      scheduled.push({
        pcoPlanId: planId,
        pcoPersonId: personRel.id,
        pcoTeamId: teamRel && !Array.isArray(teamRel) ? teamRel.id : null,
        status: (pp.attributes.status as string) ?? 'U',
        position: (pp.attributes.position as string | null) ?? null,
      });
    }

    const next = data.links?.next;
    url = next ? new URL(next).pathname + new URL(next).search : null;
  }

  return scheduled;
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
  const orgIncluded = data.included?.find((i) => i.type === 'Organization');
  return {
    id: orgIncluded?.id ?? data.data.id,
    name: orgIncluded?.attributes.name ?? 'Planning Center',
  };
}
