/**
 * Same-origin proxy for the public market data REST API.
 *
 * The upstream public endpoints send no CORS headers, so a browser cannot call
 * them directly. This route gives the client a same-origin base URL while the
 * upstream origin stays server-side.
 *
 * It is deliberately not a general relay:
 *   - only paths listed in `PROXY_ROUTES` are forwarded
 *   - only the methods declared for each path are accepted
 *   - request bodies are never forwarded
 *   - no credentials of any kind are attached to the upstream request
 */

import { NextResponse } from 'next/server';

import {
  BULK_UPSTREAM_TIMEOUT_MS,
  UPSTREAM_API_PREFIX,
  getUpstreamBaseUrl,
} from '@/config/api';
import { PROXY_ROUTES, PROXY_SLOW_ROUTES } from '@/lib/market-data/endpoints';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Upstream deadline; keeps a stuck request from holding the route open. */
const UPSTREAM_TIMEOUT_MS = 10_000;

type RouteContext = { params: Promise<{ path?: string[] }> };

async function forward(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const upstreamPath = `/${(path ?? []).join('/')}`;

  const allowedMethods = PROXY_ROUTES[upstreamPath];
  if (!allowedMethods) {
    return NextResponse.json(
      { error: 'not_found', message: 'Unsupported market data route' },
      { status: 404 },
    );
  }

  const method = request.method.toUpperCase();
  if (!allowedMethods.includes(method)) {
    return NextResponse.json(
      { error: 'method_not_allowed', message: `Allowed: ${allowedMethods.join(', ')}` },
      { status: 405 },
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(`${getUpstreamBaseUrl()}${UPSTREAM_API_PREFIX}${upstreamPath}`);
  // Copy the query verbatim; the client is responsible for valid parameters.
  target.search = incoming.search;

  // A route with a large response needs longer than the default, and the
  // deadline has to be raised here as well as at the client: this hop is the
  // one that actually waits, and its timeout surfaces as a 502 that the client
  // cannot tell apart from a genuinely unreachable upstream.
  const timeoutMs = PROXY_SLOW_ROUTES.has(upstreamPath)
    ? BULK_UPSTREAM_TIMEOUT_MS
    : UPSTREAM_TIMEOUT_MS;

  try {
    const upstream = await fetch(target, {
      method,
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });

    const body = await upstream.text();

    // Pass the payload through untouched: adapters, not the proxy, own the
    // translation, and the upstream can return errors with a 200 status.
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch {
    // The upstream origin and its wording stay server-side.
    return NextResponse.json(
      { error: 'upstream_unavailable', message: 'Market data is temporarily unavailable' },
      { status: 502 },
    );
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}
