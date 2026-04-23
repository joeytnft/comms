import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.RAILWAY_API_URL ?? 'https://api.gathersafeapp.com';

type Context = { params: Promise<{ path: string[] }> };

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.tokens?.accessToken ?? null;
  } catch {
    return null;
  }
}

async function callUpstream(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: BodyInit | undefined,
): Promise<Response> {
  return fetch(url, { method, headers, body });
}

async function proxy(request: NextRequest, ctx: Context): Promise<NextResponse> {
  let token = request.cookies.get('gs_admin_token')?.value;
  const refresh = request.cookies.get('gs_admin_refresh')?.value;

  if (!token && !refresh) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path } = await ctx.params;
  const apiPath = path.join('/');

  const url = new URL(`${API_URL}/${apiPath}`);
  request.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const method = request.method;
  const contentType = request.headers.get('content-type') ?? '';

  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    if (contentType.includes('multipart/form-data')) {
      body = await request.formData();
    } else {
      const text = await request.text();
      if (text) body = text;
    }
  }

  const buildHeaders = (t: string): Record<string, string> => {
    const h: Record<string, string> = { Authorization: `Bearer ${t}` };
    if (body && !contentType.includes('multipart/form-data')) {
      h['Content-Type'] = 'application/json';
    }
    return h;
  };

  // If no access token but we have a refresh token, get a new one before the first attempt
  let newAccessToken: string | undefined;
  if (!token && refresh) {
    const refreshed = await refreshAccessToken(refresh);
    if (!refreshed) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    token = refreshed;
    newAccessToken = refreshed;
  }

  let upstream: Response;
  try {
    upstream = await callUpstream(url.toString(), method, buildHeaders(token!), body);
  } catch {
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  }

  // On 401, attempt a single token refresh then retry
  if (upstream.status === 401 && refresh) {
    const refreshed = await refreshAccessToken(refresh);
    if (refreshed) {
      newAccessToken = refreshed;
      try {
        upstream = await callUpstream(url.toString(), method, buildHeaders(refreshed), body);
      } catch {
        return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
      }
    }
  }

  const upstreamType = upstream.headers.get('content-type') ?? '';
  let nextResponse: NextResponse;

  if (upstreamType.includes('application/json')) {
    const data = await upstream.json();
    nextResponse = NextResponse.json(data, { status: upstream.status });
  } else {
    const buffer = await upstream.arrayBuffer();
    nextResponse = new NextResponse(buffer, {
      status: upstream.status,
      headers: { 'Content-Type': upstreamType || 'application/octet-stream' },
    });
  }

  // Persist the refreshed access token back to the browser
  if (newAccessToken) {
    nextResponse.cookies.set('gs_admin_token', newAccessToken, { ...COOKIE_OPTS, maxAge: 60 * 15 });
  }

  return nextResponse;
}

export const GET = (req: NextRequest, ctx: Context) => proxy(req, ctx);
export const POST = (req: NextRequest, ctx: Context) => proxy(req, ctx);
export const PUT = (req: NextRequest, ctx: Context) => proxy(req, ctx);
export const PATCH = (req: NextRequest, ctx: Context) => proxy(req, ctx);
export const DELETE = (req: NextRequest, ctx: Context) => proxy(req, ctx);
