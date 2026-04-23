import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.RAILWAY_API_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json({ error: 'Could not reach server' }, { status: 502 });
  }

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      { error: data.message ?? 'Login failed' },
      { status: res.status },
    );
  }

  const user = data.user;
  if (!user?.isOrgAdmin && user?.role !== 'owner') {
    return NextResponse.json(
      { error: 'Admin access required. Contact your organization owner.' },
      { status: 403 },
    );
  }

  const accessToken: string = data.tokens?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: 'Invalid server response' }, { status: 502 });
  }

  const response = NextResponse.json({ user });
  response.cookies.set('gs_admin_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return response;
}
