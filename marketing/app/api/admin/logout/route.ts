import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  const clear = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  };
  response.cookies.set('gs_admin_token', '', clear);
  response.cookies.set('gs_admin_refresh', '', clear);
  return response;
}
