import { redact } from '@lib/redact';
import type { Service, ServiceOrigin } from '@core/models';

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
