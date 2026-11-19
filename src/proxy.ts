import { NextResponse, type NextRequest } from 'next/server';

// A browser may reach loopback using a public hostname. Accept only explicit
// local names so a DNS change cannot turn another site's origin into this app.
export function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase() ?? '';
  const trusted = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host);
  if (!trusted) {
    return new Response('Open Runway using localhost or 127.0.0.1.', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const response = NextResponse.next();
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
