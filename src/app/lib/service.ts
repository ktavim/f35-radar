import { redact } from '@lib/redact';
import type { Scanner, Service, ServiceOrigin, ServiceUrl } from '@core/models';

const DEFAULT_PORTS: Readonly<Record<string, number>> = { http: 80, https: 443 };

/**
 * `scheme://host[:port]`, the port only when it is not the scheme's default.
 * The backend stores hosts without IPv6 brackets, so they are added back here.
 */
export function originLabel(origin: ServiceOrigin): string {
  const host = origin.host.includes(':') ? `[${origin.host}]` : origin.host;
  const port = DEFAULT_PORTS[origin.scheme] === origin.port ? '' : `:${origin.port}`;
  return `${origin.scheme}://${host}${port}`;
}

/**
 * The page a service was first seen from: the page of its winning request,
 * else a page the interceptor called it from. Null when no page saw it, as
 * for a service only the tracer found; its other sources say where it came from.
 */
export function firstSeenOn(service: Pick<Service, 'evidence' | 'sources'>): string | null {
  const page = service.evidence?.page_url;
  if (page) return page;
  return service.sources.find((s) => s.kind === 'page')?.value ?? null;
}

/**
 * A request URL's path, for showing beside an origin that already names the
 * host. The query is dropped since it is where a token would sit. A URL that
 * does not parse is returned as given, redacted.
 */
export function requestPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return redact(url);
  }
}

/** Who saw a request, in the reviewer's terms: the page's browser, or the tracer's own probe. */
export function scannerLabel(scanner: Scanner): string {
  return scanner === 'interceptor' ? 'Browser' : 'Probe';
}

/**
 * Where the request came from, in the reviewer's terms rather than the
 * scanner's name: the interceptor records requests the page's browser made,
 * the tracer sends probes of its own. The difference matters because a probe
 * never carries the page's credentials, so its status says less about the app.
 */
export function provenanceLabel(ev: Pick<ServiceUrl, 'scanner'>): string {
  return ev.scanner === 'interceptor' ? 'Captured from the browser' : 'Sent as a probe';
}

/** The response's status code, or for a request that got none the browser's error text. */
export function responseStatus(ev: Pick<ServiceUrl, 'status_code' | 'failure_reason'>): string {
  return ev.status_code === 0 ? ev.failure_reason || 'no response recorded' : String(ev.status_code);
}

/**
 * The request's auth header as far as the scanner recorded it. The scanner
 * keeps the scheme word and drops the credential after it at capture, so the
 * stars stand for a value that was sent but never stored. Null when the
 * request carried no Authorization header, as the tracer's probes never do.
 */
export function requestHeaders(ev: Pick<ServiceUrl, 'sent_auth_scheme'>): string | null {
  return ev.sent_auth_scheme ? `Authorization: ${ev.sent_auth_scheme} *****` : null;
}

/**
 * The response headers the scanner recorded: the challenge, and a redirect's
 * target with its query, fragment and userinfo already stripped. Null when
 * the response carried neither.
 */
export function responseHeaders(ev: Pick<ServiceUrl, 'auth_challenge' | 'redirect_url'>): string | null {
  const lines: string[] = [];
  if (ev.auth_challenge) lines.push(`WWW-Authenticate: ${ev.auth_challenge}`);
  if (ev.redirect_url) lines.push(`Location: ${ev.redirect_url}`);
  return lines.length ? redact(lines.join('\n')) : null;
}
