import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.RAILWAY_API_URL ?? 'https://api.gathersafeapp.com';

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, ctx: Context): Promise<NextResponse> {
  const token = request.cookies.get('gs_admin_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path } = await ctx.params;
  const apiPath = path.join('/');

  const url = new URL(`${API_URL}/${apiPath}`);
  request.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const method = request.method;
  const contentType = request.headers.get('content-type') ?? '';

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  let body: BodyInit | undefined;

  if (method !== 'GET' && method !== 'HEAD') {
    if (contentType.includes('multipart/form-data')) {
      // Stream multipart directly so the server can parse the boundary
      const formData = await request.formData();
      body = formData;
    } else {
      const text = await request.text();
      if (text) {
        body = text;
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), { method, headers, body });
  } catch {
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  }

  const upstreamType = upstream.headers.get('content-type') ?? '';
  if (upstreamType.includes('application/json')) {
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  }

  const buffer = await upstream.arrayBuffer();
  return new NextResponse(buffer, {
    status: upstream.status,
    headers: { 'Content-Type': upstreamType || 'application/octet-stream' },
  });
}

export const GET = (req: NextRequest, ctx: Context) => proxy(req, ctx);
export const POST = (req: NextRequest, ctx: Context) => proxy(req, ctx);
export const PUT = (req: NextRequest, ctx: Context) => proxy(req, ctx);
export const PATCH = (req: NextRequest, ctx: Context) => proxy(req, ctx);
export const DELETE = (req: NextRequest, ctx: Context) => proxy(req, ctx);
