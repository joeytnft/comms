import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { generateVerifier, deriveChallenge } from '../services/pco/pkce';
import {
  exchangeCode,
  revokeConnection,
  getPcoOrgInfo,
  syncPeople,
  syncServiceTypes,
  syncUpcomingPlans,
  syncTeams,
  syncPlanPeople,
} from '../services/pco/pcoService';
import { sendInviteEmail } from '../services/emailService';
import { ValidationError, NotFoundError } from '../utils/errors';

const PCO_SCOPES = 'people services';
const VERIFIER_TTL = 600; // 10 min
const APP_DEEP_LINK = 'gathersafe://integrations/pco';
const INVITE_EXPIRY_DAYS = 7;
const SALT_ROUNDS = 12;

// ─── Initiate OAuth ────────────────────────────────────────────────────────────

export async function initiateConnect(request: FastifyRequest, reply: FastifyReply) {
  if (!env.PCO_CLIENT_ID) {
    throw new ValidationError('Planning Center integration is not configured on this server');
  }

  const verifier = generateVerifier();
  const challenge = deriveChallenge(verifier);

  await redis.setex(`pco:verifier:${request.userId}`, VERIFIER_TTL, verifier);

  const params = new URLSearchParams({
    client_id: env.PCO_CLIENT_ID,
    redirect_uri: env.PCO_REDIRECT_URI ?? '',
    response_type: 'code',
    scope: PCO_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: Buffer.from(JSON.stringify({ userId: request.userId, orgId: request.organizationId })).toString('base64url'),
  });

  const authorizeUrl = `https://api.planningcenteronline.com/oauth/authorize?${params}`;
  reply.send({ authorizeUrl });
}

// ─── OAuth Callback ───────────────────────────────────────────────────────────

export async function handleCallback(
  request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>,
  reply: FastifyReply,
) {
  const { code, state, error } = request.query;

  if (error || !code || !state) {
    return reply.redirect(`${APP_DEEP_LINK}/error?reason=${encodeURIComponent(error ?? 'missing_params')}`);
  }

  let userId: string;
  let orgId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    userId = decoded.userId;
    orgId = decoded.orgId;
  } catch {
    return reply.redirect(`${APP_DEEP_LINK}/error?reason=invalid_state`);
  }

  const verifier = await redis.get(`pco:verifier:${userId}`);
  if (!verifier) {
    return reply.redirect(`${APP_DEEP_LINK}/error?reason=verifier_expired`);
  }
  await redis.del(`pco:verifier:${userId}`);

  try {
    const tokens = await exchangeCode(code, verifier);
    const orgInfo = await getPcoOrgInfo(tokens.accessToken);

    await prisma.pcoConnection.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scope: tokens.scope,
        pcoOrgId: orgInfo.id,
        pcoOrgName: orgInfo.name,
        connectedById: userId,
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scope: tokens.scope,
        pcoOrgId: orgInfo.id,
        pcoOrgName: orgInfo.name,
        connectedById: userId,
        connectedAt: new Date(),
      },
    });

    await prisma.organization.update({
      where: { id: orgId },
      data: { pcoIntegrationEnabled: true },
    });

    reply.redirect(`${APP_DEEP_LINK}/success?org=${encodeURIComponent(orgInfo.name)}`);
  } catch (err) {
    request.log.error(err, '[PCO] Callback error');
    reply.redirect(`${APP_DEEP_LINK}/error?reason=token_exchange_failed`);
  }
}

// ─── Connection Status ────────────────────────────────────────────────────────

export async function getStatus(request: FastifyRequest, reply: FastifyReply) {
  const conn = await prisma.pcoConnection.findUnique({
    where: { organizationId: request.organizationId },
    select: {
      pcoOrgName: true,
      connectedAt: true,
      lastSyncAt: true,
      scope: true,
    },
  });

  reply.send({
    connected: !!conn,
    pcoOrgName: conn?.pcoOrgName ?? null,
    connectedAt: conn?.connectedAt ?? null,
    lastSyncAt: conn?.lastSyncAt ?? null,
    scopes: conn?.scope?.split(' ') ?? [],
  });
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnect(request: FastifyRequest, reply: FastifyReply) {
  await revokeConnection(request.organizationId);
  reply.send({ ok: true });
}

// ─── Sync People + Auto-Provision Accounts ────────────────────────────────────

export async function syncPeopleHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.organizationId;
  const pcoPeople = await syncPeople(orgId);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });

  const results = {
    synced: pcoPeople.length,
    invited: 0,
    linked: 0,
    skipped: 0,
  };

  // Upsert all into pco_people and provision GatherSafe accounts
  for (const p of pcoPeople) {
    await prisma.pcoPerson.upsert({
      where: { organizationId_pcoId: { organizationId: orgId, pcoId: p.id } },
      create: {
        organizationId: orgId,
        pcoId: p.id,
        name: p.name,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email ?? null,
        phone: p.phone ?? null,
        avatarUrl: p.avatarUrl ?? null,
        status: p.status,
      },
      update: {
        name: p.name,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email ?? null,
        phone: p.phone ?? null,
        avatarUrl: p.avatarUrl ?? null,
        status: p.status,
      },
    });

    if (!p.email) {
      results.skipped++;
      continue;
    }

    // Check if a GatherSafe user already exists with this email
    const existing = await prisma.user.findUnique({ where: { email: p.email } });

    if (existing) {
      // Link to PCO person if not already linked
      if (!existing.pcoPersonId) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { pcoPersonId: p.id },
        });
      }
      results.linked++;
    } else {
      // Provision a new invited account
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const inviteExpiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      // Random password hash — user must set their own via invite link
      const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), SALT_ROUNDS);

      await prisma.user.create({
        data: {
          email: p.email,
          passwordHash,
          displayName: p.name,
          phone: p.phone ?? null,
          avatarUrl: p.avatarUrl ?? null,
          organizationId: orgId,
          pcoPersonId: p.id,
          accountStatus: 'INVITED',
          inviteToken,
          inviteExpiresAt,
        },
      });

      await sendInviteEmail(p.email, p.firstName, org?.name ?? 'GatherSafe', inviteToken);
      results.invited++;
    }
  }

  await prisma.pcoConnection.update({
    where: { organizationId: orgId },
    data: { lastSyncAt: new Date() },
  });

  reply.send({ ...results, people: pcoPeople });
}

// ─── Get Synced People ────────────────────────────────────────────────────────

export async function getPeopleHandler(request: FastifyRequest, reply: FastifyReply) {
  const people = await prisma.pcoPerson.findMany({
    where: { organizationId: request.organizationId, status: 'active' },
    orderBy: { lastName: 'asc' },
  });

  // Enrich with account status from users table
  const emails = people.map((p) => p.email).filter(Boolean) as string[];
  const usersByEmail = await prisma.user.findMany({
    where: { email: { in: emails }, organizationId: request.organizationId },
    select: { email: true, accountStatus: true, id: true },
  });
  const userMap = Object.fromEntries(usersByEmail.map((u) => [u.email, u]));

  const enriched = people.map((p) => ({
    ...p,
    gatherSafeUser: p.email ? (userMap[p.email] ?? null) : null,
  }));

  reply.send({ people: enriched });
}

// ─── Sync Teams + Team Members ────────────────────────────────────────────────

export async function syncTeamsHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.organizationId;
  const serviceTypes = await syncServiceTypes(orgId);

  let totalTeams = 0;
  let totalMembers = 0;

  for (const st of serviceTypes) {
    const { teams, members } = await syncTeams(orgId, st.id, st.name);
    totalTeams += teams.length;
    totalMembers += members.length;

    // Upsert teams
    for (const team of teams) {
      await prisma.pcoTeam.upsert({
        where: { organizationId_pcoId: { organizationId: orgId, pcoId: team.id } },
        create: {
          organizationId: orgId,
          pcoId: team.id,
          serviceTypeId: team.serviceTypeId,
          serviceTypeName: team.serviceTypeName,
          name: team.name,
        },
        update: {
          serviceTypeName: team.serviceTypeName,
          name: team.name,
        },
      });
    }

    // Upsert team members
    for (const member of members) {
      await prisma.pcoTeamMember.upsert({
        where: {
          organizationId_pcoTeamId_pcoPersonId: {
            organizationId: orgId,
            pcoTeamId: member.pcoTeamId,
            pcoPersonId: member.pcoPersonId,
          },
        },
        create: {
          organizationId: orgId,
          pcoTeamId: member.pcoTeamId,
          pcoPersonId: member.pcoPersonId,
        },
        update: {},
      });
    }
  }

  // Auto-assign members to linked GatherSafe groups
  await applyTeamGroupAssignments(orgId);

  await prisma.pcoConnection.update({
    where: { organizationId: orgId },
    data: { lastSyncAt: new Date() },
  });

  reply.send({ serviceTypes: serviceTypes.length, teams: totalTeams, members: totalMembers });
}

// ─── Get Teams ────────────────────────────────────────────────────────────────

export async function getTeamsHandler(request: FastifyRequest, reply: FastifyReply) {
  const teams = await prisma.pcoTeam.findMany({
    where: { organizationId: request.organizationId },
    orderBy: [{ serviceTypeName: 'asc' }, { name: 'asc' }],
  });

  // Attach member counts
  const memberCounts = await prisma.pcoTeamMember.groupBy({
    by: ['pcoTeamId'],
    where: { organizationId: request.organizationId },
    _count: { pcoTeamId: true },
  });
  const countMap = Object.fromEntries(memberCounts.map((r) => [r.pcoTeamId, r._count.pcoTeamId]));

  // Attach linked group names
  const groupIds = teams.map((t) => t.groupId).filter(Boolean) as string[];
  const groups = groupIds.length
    ? await prisma.group.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, name: true },
      })
    : [];
  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g.name]));

  const enriched = teams.map((t) => ({
    ...t,
    memberCount: countMap[t.pcoId] ?? 0,
    linkedGroupName: t.groupId ? (groupMap[t.groupId] ?? null) : null,
  }));

  reply.send({ teams: enriched });
}

// ─── Link PCO Team → GatherSafe Group ─────────────────────────────────────────

export async function linkTeamHandler(
  request: FastifyRequest<{ Params: { pcoTeamId: string }; Body: { groupId: string | null } }>,
  reply: FastifyReply,
) {
  const { pcoTeamId } = request.params;
  const { groupId } = request.body;

  const team = await prisma.pcoTeam.findFirst({
    where: { pcoId: pcoTeamId, organizationId: request.organizationId },
  });
  if (!team) throw new NotFoundError('PCO team');

  if (groupId) {
    const group = await prisma.group.findFirst({
      where: { id: groupId, organizationId: request.organizationId },
    });
    if (!group) throw new NotFoundError('Group');
  }

  await prisma.pcoTeam.update({
    where: { id: team.id },
    data: { groupId: groupId ?? null },
  });

  // Immediately apply assignments for this team
  if (groupId) {
    await applyTeamGroupAssignments(request.organizationId, team.pcoId);
  }

  reply.send({ ok: true });
}

// ─── Sync Services + Scheduled People ────────────────────────────────────────

export async function syncServicesHandler(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.organizationId;
  const serviceTypes = await syncServiceTypes(orgId);
  const allPlans = [];

  for (const st of serviceTypes) {
    const plans = await syncUpcomingPlans(orgId, st.id, st.name, 20);
    allPlans.push(...plans);
  }

  // Upsert plans
  for (const p of allPlans) {
    await prisma.pcoPlan.upsert({
      where: { organizationId_pcoId: { organizationId: orgId, pcoId: p.id } },
      create: {
        organizationId: orgId,
        pcoId: p.id,
        serviceTypeId: p.serviceTypeId,
        serviceTypeName: p.serviceTypeName,
        title: p.title ?? null,
        seriesTitle: p.seriesTitle ?? null,
        sortDate: p.sortDate ? new Date(p.sortDate) : null,
        totalLength: p.totalLength,
      },
      update: {
        serviceTypeName: p.serviceTypeName,
        title: p.title ?? null,
        seriesTitle: p.seriesTitle ?? null,
        sortDate: p.sortDate ? new Date(p.sortDate) : null,
        totalLength: p.totalLength,
      },
    });

    // Sync scheduled people for this plan
    const scheduled = await syncPlanPeople(orgId, p.serviceTypeId, p.id);
    for (const sp of scheduled) {
      await prisma.pcoScheduledPerson.upsert({
        where: {
          organizationId_pcoPlanId_pcoPersonId: {
            organizationId: orgId,
            pcoPlanId: sp.pcoPlanId,
            pcoPersonId: sp.pcoPersonId,
          },
        },
        create: {
          organizationId: orgId,
          pcoPlanId: sp.pcoPlanId,
          pcoPersonId: sp.pcoPersonId,
          pcoTeamId: sp.pcoTeamId ?? null,
          status: sp.status,
          position: sp.position ?? null,
        },
        update: {
          pcoTeamId: sp.pcoTeamId ?? null,
          status: sp.status,
          position: sp.position ?? null,
        },
      });
    }
  }

  await prisma.pcoConnection.update({
    where: { organizationId: orgId },
    data: { lastSyncAt: new Date() },
  });

  reply.send({ serviceTypes, plans: allPlans });
}

// ─── Get Plans ────────────────────────────────────────────────────────────────

export async function getPlansHandler(request: FastifyRequest, reply: FastifyReply) {
  const plans = await prisma.pcoPlan.findMany({
    where: {
      organizationId: request.organizationId,
      sortDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { sortDate: 'asc' },
  });
  reply.send({ plans });
}

// ─── Get Schedule for a Plan ──────────────────────────────────────────────────

export async function getPlanScheduleHandler(
  request: FastifyRequest<{ Params: { pcoId: string } }>,
  reply: FastifyReply,
) {
  const plan = await prisma.pcoPlan.findFirst({
    where: { pcoId: request.params.pcoId, organizationId: request.organizationId },
  });
  if (!plan) throw new NotFoundError('Plan');

  const scheduled = await prisma.pcoScheduledPerson.findMany({
    where: { organizationId: request.organizationId, pcoPlanId: request.params.pcoId },
  });

  // Enrich with person names from pco_people
  const personIds = scheduled.map((s) => s.pcoPersonId);
  const people = await prisma.pcoPerson.findMany({
    where: { organizationId: request.organizationId, pcoId: { in: personIds } },
    select: { pcoId: true, name: true, avatarUrl: true },
  });
  const personMap = Object.fromEntries(people.map((p) => [p.pcoId, p]));

  // Enrich with team names
  const teamIds = scheduled.map((s) => s.pcoTeamId).filter(Boolean) as string[];
  const teams = teamIds.length
    ? await prisma.pcoTeam.findMany({
        where: { organizationId: request.organizationId, pcoId: { in: teamIds } },
        select: { pcoId: true, name: true },
      })
    : [];
  const teamMap = Object.fromEntries(teams.map((t) => [t.pcoId, t.name]));

  const enriched = scheduled.map((s) => ({
    ...s,
    person: personMap[s.pcoPersonId] ?? null,
    teamName: s.pcoTeamId ? (teamMap[s.pcoTeamId] ?? null) : null,
  }));

  reply.send({ plan, scheduled: enriched });
}

// ─── Internal: apply team→group assignments ────────────────────────────────────

async function applyTeamGroupAssignments(orgId: string, pcoTeamId?: string) {
  const whereTeam = pcoTeamId
    ? { organizationId: orgId, pcoId: pcoTeamId, groupId: { not: null } }
    : { organizationId: orgId, groupId: { not: null } };

  const linkedTeams = await prisma.pcoTeam.findMany({ where: whereTeam });

  for (const team of linkedTeams) {
    if (!team.groupId) continue;

    const members = await prisma.pcoTeamMember.findMany({
      where: { organizationId: orgId, pcoTeamId: team.pcoId },
    });

    for (const member of members) {
      // Find the GatherSafe user linked to this PCO person
      const user = await prisma.user.findFirst({
        where: { organizationId: orgId, pcoPersonId: member.pcoPersonId },
        select: { id: true },
      });
      if (!user) continue;

      // Add to group if not already a member
      await prisma.groupMembership.upsert({
        where: { groupId_userId: { groupId: team.groupId!, userId: user.id } },
        create: { groupId: team.groupId!, userId: user.id, role: 'MEMBER' },
        update: {},
      });
    }
  }
}
