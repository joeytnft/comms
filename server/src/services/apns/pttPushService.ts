/**
 * Apple PTT Push Service
 *
 * Sends "pushtotalk" APNs notifications to iOS devices when a PTT transmission
 * starts or ends.  The push wakes the app in the background and the native
 * PTChannelManager handles the rest.
 *
 * Authentication: JWT-based APNs auth (ES256 with your .p8 key).
 *
 * Required env vars:
 *   APNS_KEY_ID      — 10-char key ID from Apple Developer → Certificates, IDs & Profiles → Keys
 *   APNS_TEAM_ID     — 10-char Apple Developer team ID
 *   APNS_KEY         — Full P8 private key contents (newlines as \n)
 *   APNS_BUNDLE_ID   — e.g. com.gathersafeapp.app
 *   APNS_PRODUCTION  — "true" for App Store / TestFlight builds; omit for dev/sandbox
 */

import http2 from 'http2';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';

// ─── JWT helpers ──────────────────────────────────────────────────────────────

function base64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

let cachedJWT: string | null = null;
let cachedJWTIssuedAt = 0;
const JWT_TTL_SECONDS = 55 * 60;

// Subtle crypto is available in Node 18+ and bypasses OpenSSL's PKCS8 decoder,
// which rejects valid .p8 keys on some Railway / OpenSSL 3 configurations with
// ERR_OSSL_UNSUPPORTED.  Web Crypto ECDSA sign() returns the signature in
// raw R||S (ieee-p1363) format — exactly what APNs expects.
const subtle = crypto.webcrypto.subtle;

// Normalize a PEM-encoded private key read from an env var.
//
// Hosting platforms (Railway, Fly.io, Heroku) may encode multi-line env vars
// in several incompatible ways: literal "\n" escape sequences, CR+LF line
// endings, or the entire key as one long base64 string with no newlines at all.
// OpenSSL 3 is stricter than OpenSSL 1.x and rejects malformed PEM bodies with
// ERR_OSSL_UNSUPPORTED / "DECODER routines::unsupported".
//
// This function:
//  1. Converts any literal \n or \r\n sequences to real newlines
//  2. Extracts the base64 body, strips ALL whitespace, then re-wraps at 64 chars
//     (the canonical PEM line length — handles single-line and weirdly-wrapped keys)
function normalizePemKey(raw: string): string {
  const withNewlines = raw.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const match = withNewlines.match(/-----BEGIN ([A-Z ]+)-----\s*([\s\S]+?)\s*-----END ([A-Z ]+)-----/);
  if (match) {
    const header  = `-----BEGIN ${match[1]}-----`;
    const footer  = `-----END ${match[3]}-----`;
    const body    = match[2].replace(/\s+/g, ''); // strip all whitespace from base64 body
    const wrapped = (body.match(/.{1,64}/g) ?? [body]).join('\n');
    return `${header}\n${wrapped}\n${footer}`;
  }
  return withNewlines;
}

async function buildJWT(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJWT && now - cachedJWTIssuedAt < JWT_TTL_SECONDS) return cachedJWT;

  const keyId  = env.APNS_KEY_ID;
  const teamId = env.APNS_TEAM_ID;
  const rawKey = env.APNS_KEY;

  if (!keyId || !teamId || !rawKey) {
    throw new Error('APNS_KEY_ID, APNS_TEAM_ID, and APNS_KEY env vars are required for PTT pushes');
  }

  const pemKey = normalizePemKey(rawKey);

  // Extract the raw DER bytes from the PEM body (strip header/footer + whitespace)
  const derBase64 = pemKey
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s/g, '');
  const derBuffer = Buffer.from(derBase64, 'base64');

  // importKey via Web Crypto avoids the OpenSSL 3 PKCS8 decoder that raises
  // ERR_OSSL_UNSUPPORTED on some Railway configurations.  Apple .p8 keys are
  // PKCS#8-wrapped P-256 — this is the correct format parameter.
  const cryptoKey = await subtle.importKey(
    'pkcs8',
    derBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const header  = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: now }));
  const data    = `${header}.${payload}`;

  // Web Crypto ECDSA returns R||S (ieee-p1363) format natively — no conversion needed.
  const sigBuffer = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    Buffer.from(data),
  );

  cachedJWT = `${data}.${base64url(Buffer.from(sigBuffer))}`;
  cachedJWTIssuedAt = now;
  return cachedJWT;
}

// ─── HTTP/2 APNs client ──────────────────────────────────────────────────────

const APNS_HOST_PROD    = 'api.push.apple.com';
const APNS_HOST_SANDBOX = 'api.sandbox.push.apple.com';

function getHost(): string {
  return env.APNS_PRODUCTION === 'true' ? APNS_HOST_PROD : APNS_HOST_SANDBOX;
}

// We keep a single persistent HTTP/2 session for efficiency
let h2session: http2.ClientHttp2Session | null = null;

function getSession(): Promise<http2.ClientHttp2Session> {
  return new Promise((resolve, reject) => {
    if (h2session && !h2session.destroyed && !h2session.closed) {
      resolve(h2session);
      return;
    }
    const host = getHost();
    const session = http2.connect(`https://${host}`);
    session.on('error', (err) => {
      h2session = null;
      reject(err);
    });
    session.on('connect', () => {
      h2session = session;
      resolve(session);
    });
  });
}

// ─── Send a single PTT push ───────────────────────────────────────────────────

interface PTTPushPayload {
  /** Name of the active speaker, or undefined/empty to clear (end of transmission) */
  activeSpeaker?: string;
  /** The PTT channel / group ID */
  channelId: string;
  /** The transmitting user's ID */
  userId?: string;
}

async function sendPTTPush(deviceToken: string, payload: PTTPushPayload): Promise<void> {
  const bundleId = env.APNS_BUNDLE_ID;
  if (!bundleId) throw new Error('APNS_BUNDLE_ID is required');

  const host    = getHost();
  const jwt     = await buildJWT();
  const path    = `/3/device/${deviceToken}`;
  const body    = JSON.stringify(payload);

  const session = await getSession();

  return new Promise((resolve, reject) => {
    const req = session.request({
      ':method':                   'POST',
      ':path':                     path,
      ':scheme':                   'https',
      ':authority':                host,
      'authorization':             `bearer ${jwt}`,
      'apns-push-type':            'pushtotalk',
      'apns-topic':                `${bundleId}.voip-ptt`,
      'apns-priority':             '10',
      'apns-expiration':           '0',
      'content-type':              'application/json',
      'content-length':            Buffer.byteLength(body).toString(),
    });

    let status = 0;
    let responseBody = '';

    req.on('response', (headers) => {
      status = headers[':status'] as number;
    });

    req.on('data', (chunk) => { responseBody += chunk; });

    req.on('end', () => {
      if (status === 200) {
        resolve();
      } else {
        let apnsReason = responseBody;
        try { apnsReason = JSON.parse(responseBody)?.reason ?? responseBody; } catch { /* raw */ }
        logger.warn({ status, apnsReason, deviceToken: `${deviceToken.slice(0, 8)}…` }, '[APNs] PTT push failed');
        reject(new Error(`APNs ${status}: ${apnsReason}`));
      }
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Notify all `deviceTokens` that `displayName` started transmitting on `channelId`.
 * Fires-and-forgets per token; logs errors but does not throw.
 */
export async function notifyTransmissionStarted(
  deviceTokens: string[],
  channelId: string,
  userId: string,
  displayName: string,
): Promise<void> {
  if (!env.APNS_KEY_ID) return; // APNs not configured — skip silently

  const payload: PTTPushPayload = { activeSpeaker: displayName, channelId, userId };
  await Promise.allSettled(
    deviceTokens.map((token) =>
      sendPTTPush(token, payload).catch((err) =>
        logger.error({ err, token }, '[APNs] notifyTransmissionStarted failed'),
      ),
    ),
  );
}

/**
 * Notify all `deviceTokens` that transmission on `channelId` has ended.
 *
 * We intentionally do NOT send a pushtotalk APNs push here. A stop push
 * (no activeSpeaker) would call incomingPushResultForChannelManager on
 * background devices, which must return a non-nil PTPushResult — the only
 * valid options being pushResultForActiveRemoteParticipant: (requires non-nil
 * PTParticipant) or leaveChannelPushResult (forces a channel leave). Neither
 * is desirable for a stop event. Live Activity pushes handle the speaker UI
 * via ActivityKit, so the pushtotalk stop push is not needed.
 */
export async function notifyTransmissionStopped(
  _deviceTokens: string[],
  _channelId: string,
): Promise<void> {
  // Intentional no-op — see comment above.
}
