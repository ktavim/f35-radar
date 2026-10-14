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
 * else the first page the interceptor called it from, else wherever the
 * tracer found it. Null when the service has no evidence and no sources.
 */
export function firstSeenOn(service: Pick<Service, 'evidence' | 'sources'>): string | null {
  const page = service.evidence?.page_url;
  if (page) return page;
  const pageSource = service.sources.find((s) => s.kind === 'page');
  return pageSource?.value ?? service.sources[0]?.value ?? null;
}
