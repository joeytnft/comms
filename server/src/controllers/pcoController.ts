import { FastifyRequest, FastifyReply } from 'fastify';
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
} from '../services/pco/pcoService';
import { ValidationError } from '../utils/errors';

const PCO_SCOPES = 'people services';
const VERIFIER_TTL = 600; // 10 min
const APP_DEEP_LINK = 'guardiancomm://integrations/pco';

// ─── Initiate OAuth ────────────────────────────────────────────────────────────

export async function initiateConnect(request: FastifyRequest, reply: FastifyReply) {
  if (!env.PCO_CLIENT_ID) {
    throw new ValidationError('Planning Center integration is not configured on this server');
  }

  const verifier = generateVerifier();
  const challenge = deriveChallenge(verifier);

  // Store verifier in Redis keyed by userId (TTL 10 min)
  await redis.setex(`pco:verifier:${request.userId}`, VERIFIER_TTL, verifier);

  const params = new URLSearchParams({
    client_id: env.PCO_CLIENT_ID,
    redirect_uri: env.PCO_REDIRECT_URI ?? '',
    response_type: 'code',
    scope: PCO_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // Embed userId in state so we can recover it in the callback (no session cookie)
    state: Buffer.from(JSON.stringify({ userId: request.userId, orgId: request.organizationId })).toString('base64url'),
  });

  const authorizeUrl = `https://api.planningcenteronline.com/oauth/authorize?${params}`;
  reply.send({ authorizeUrl });
}

// ─── OAuth Callback (browser redirect from PCO) ───────────────────────────────

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

  // Recover PKCE verifier
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

// ─── Get Connection Status ────────────────────────────────────────────────────

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

// ─── Sync People ─────────────────────────────────────────────────────────────

export async function syncPeopleHandler(request: FastifyRequest, reply: FastifyReply) {
  const people = await syncPeople(request.organizationId);

  await prisma.pcoConnection.update({
    where: { organizationId: request.organizationId },
    data: { lastSyncAt: new Date() },
  });

  reply.send({ synced: people.length, people });
}

// ─── Sync Services ────────────────────────────────────────────────────────────

export async function syncServicesHandler(request: FastifyRequest, reply: FastifyReply) {
  const serviceTypes = await syncServiceTypes(request.organizationId);

  const allPlans = [];
  for (const st of serviceTypes) {
    const plans = await syncUpcomingPlans(request.organizationId, st.id, st.name, 10);
    allPlans.push(...plans);
  }

  await prisma.pcoConnection.update({
    where: { organizationId: request.organizationId },
    data: { lastSyncAt: new Date() },
  });

  reply.send({ serviceTypes, plans: allPlans });
}
