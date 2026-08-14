import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Forward request to the local backend speak service (configurable via env)
    const backendUrl = process.env.SPEAK_BACKEND_URL || 'http://127.0.0.1:5000/speak';

    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const contentType = res.headers.get('content-type') || 'text/plain';
    const text = await res.text();

    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    console.error('speak proxy error:', err);
    return NextResponse.json({ error: 'Proxy request failed' }, { status: 502 });
  }
}

export async function GET() {
  // Simple health check for the proxy route
  return NextResponse.json({ status: 'ok' });
}
