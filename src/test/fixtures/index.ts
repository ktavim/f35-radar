import type {
  AuthMethod,
  Finding,
  ScanDetail,
  ScanEvent,
  ScanJob,
  ScanSummary,
  Scanner,
  Service,
  ServiceSource,
  ServiceUrl
} from '@core/models';
import { severityForAuthMethod } from '@lib/verdict';

export const APP_NAMES: Record<string, string> = {
  app_payroll: 'Payroll v3',
  app_legacy_erp: 'Legacy ERP shim',
  app_internal_tools: 'Internal Tools',
  app_finops: 'FinOps dashboard',
  app_megaportal: 'Megaportal',
  app_timesheets: 'Timesheets'
};

const HOSTS = [
  'auth.contoso.com',
  'api.contoso.com',
  'reports.contoso.com',
  'analytics.contoso.com',
  'cdn.contoso.com',
  'data.contoso.com',
  'sso.partner.com',
  'graph.microsoft.com',
  'login.microsoftonline.com',
  'metrics.contoso.com',
  'logs.contoso.com',
  'mail.contoso.com',
  'queue.internal',
  'search.contoso.com',
  'feature-flags.contoso.com'
];

// Methods that clear, rotated over the "friendly" services. Basic used to be
// in this list; the backend now blocks it.
const CLEARED_ROTATION: AuthMethod[] = [
  'oauth', 'bearer', 'login_redirect', 'kerberos', 'unauthenticated', 'api_key'
];
// Methods that land in review: SPNEGO whose mechanism went unresolved, and the
// answers the scanners could not classify, which the manual override fills in.
const REVIEW_ROTATION: AuthMethod[] = ['negotiate', 'unknown', 'no_response', 'dns_failed'];

export interface ScanFixture {
  scan: ScanDetail;
  services: Service[];
  events: ScanEvent[];
}

let serviceId = 0;
const newServiceId = () => `svc_${(++serviceId).toString().padStart(5, '0')}`;
let urlId = 0;
const newUrlId = () => `url_${(++urlId).toString().padStart(5, '0')}`;

interface ServiceOpts {
  /** Which scanners found the origin; defaults to a rotation over the index. */
  foundBy?: Scanner[];
  /** The origin is already published through the F5. */
  published?: boolean;
  /** The scanned app's URL: the base of the page the origin was first seen on. */
  pageBase?: string;
}

function pagePath(idx: number): string {
  return idx % 2 === 0 ? '/dashboard' : `/reports/${1990 + idx}`;
}

/** The path of the page a service was first seen on, for the live feed's page_visited line. */
export function pagePathOf(s: Service): string {
  const page = s.evidence?.page_url;
  if (!page) return '/';
  try {
    return new URL(page).pathname;
  } catch {
    return '/';
  }
}

/** The (scheme, host, port) triple the server puts on every per-origin event. */
export function originPayload(s: Service): { scheme: string; host: string; port: number } {
  return { scheme: s.scheme, host: s.host, port: s.port };
}

function challengeFor(auth: AuthMethod): string | null {
  switch (auth) {
    case 'ntlm':
      return 'NTLM TlRMTVNTUAACAAAABgAGADgAAAAFgomiQaAAAAAAAAAAAAAAAAAAAD4AAAAFAs4OAAAAD0...';
    case 'negotiate':
      return 'Negotiate';
    case 'kerberos':
      return 'Negotiate YIIFbgYGKwYBBQUCoIIFYjCCBV6gMDAuBgkqhkiC9xIBAgIGCSqGSIb3EgECAg...';
    case 'basic':
      return 'Basic realm="contoso"';
    case 'bearer':
    case 'oauth':
      return 'Bearer realm="contoso", error="invalid_token"';
    default:
      return null;
  }
}

function makeUrl(scanner: Scanner, host: string, auth: AuthMethod, pageUrl: string): ServiceUrl {
  const noResponse = auth === 'no_response' || auth === 'dns_failed';
  const challenged = (['ntlm', 'negotiate', 'kerberos', 'basic', 'unknown'] as AuthMethod[]).includes(auth);
  return {
    id: newUrlId(),
    scanner,
    method: 'GET',
    url: `https://${host}/api/${host.split('.')[0]}`,
    resource_type: scanner === 'tracer' ? 'probe' : 'xhr',
    status_code: noResponse ? 0 : auth === 'login_redirect' ? 302 : challenged ? 401 : 200,
    failure_reason:
      auth === 'dns_failed'
        ? 'net::ERR_NAME_NOT_RESOLVED'
        : auth === 'no_response'
        ? 'net::ERR_CONNECTION_TIMED_OUT'
        : null,
    auth_method: auth,
    sent_auth_scheme: auth === 'bearer' || auth === 'oauth' ? 'Bearer' : auth === 'api_key' ? 'ApiKey' : null,
    auth_challenge: challengeFor(auth),
    redirect_url:
      auth === 'login_redirect' ? 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize' : null,
    page_url: pageUrl,
    // The tracer's provenance: the bundle on the scanned app that named the URL.
    sources: scanner === 'tracer' ? [`js:${new URL(pageUrl).origin}/static/main.js`] : []
  };
}

function makeService(host: string, auth: AuthMethod, idx: number, opts: ServiceOpts = {}): Service {
  const foundBy: Scanner[] =
    opts.foundBy ?? (idx % 3 === 0 ? ['interceptor'] : idx % 3 === 1 ? ['tracer'] : ['interceptor', 'tracer']);
  const pageUrl = `${opts.pageBase ?? 'https://app.intranet.contoso.com'}${pagePath(idx)}`;
  const findings: Finding[] = foundBy.map((scanner) => ({
    scanner,
    auth_method: auth,
    severity: severityForAuthMethod(auth),
    evidence: makeUrl(scanner, host, auth, pageUrl)
  }));
  // Sorted by kind then value, as the server folds them.
  const sources: ServiceSource[] = [];
  if (foundBy.includes('tracer')) sources.push({ kind: 'js', value: `${new URL(pageUrl).origin}/static/main.js` });
  if (foundBy.includes('interceptor')) sources.push({ kind: 'page', value: pageUrl });
  const published = opts.published === true;
  return {
    id: newServiceId(),
    scheme: 'https',
    host,
    port: 443,
    auth_method: auth,
    scanners_auth_method: auth,
    severity: published ? 'published' : severityForAuthMethod(auth),
    request_count: Math.floor(Math.random() * 80) + 1,
    ips: auth === 'dns_failed' ? null : [`10.${idx % 200}.${(idx * 7) % 250}.${((idx * 13) % 250) + 1}`],
    evidence: findings[0]?.evidence ?? null,
    found_by: foundBy,
    findings,
    sources,
    excluded: false,
    published_origin: published
      ? {
          id: `pub_${idx.toString().padStart(3, '0')}`,
          scheme: 'https',
          host,
          port: 443,
          note: 'Published through the legacy F5 iRule before this tool existed.',
          added_by: 'f5-admin',
          added_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
          removed_at: null,
          removed_by: null
        }
      : null
  };
}

/** The service with its method set by hand, as the manual override leaves it. */
function corrected(s: Service, method: AuthMethod): Service {
  return {
    ...s,
    auth_method: method,
    severity: s.severity === 'published' ? 'published' : severityForAuthMethod(method)
  };
}

/** One job per scanner, in the state the scan's status implies. */
function makeJobs(scan: ScanDetail, error?: string): ScanJob[] {
  const started = scan.started_at;
  const ended = scan.completed_at ?? null;
  const failure = error ?? 'unknown error';
  const interceptorDone: ScanJob = {
    scanner: 'interceptor',
    status: 'completed',
    started_at: started,
    completed_at: ended,
    pages_crawled: scan.pages_crawled ?? 0
  };
  switch (scan.status) {
    case 'queued':
      return [{ scanner: 'interceptor', status: 'queued' }, { scanner: 'tracer', status: 'queued' }];
    case 'running':
      return [
        { scanner: 'interceptor', status: 'running', started_at: started },
        { scanner: 'tracer', status: 'running', started_at: started }
      ];
    case 'completed':
      return [interceptorDone, { scanner: 'tracer', status: 'completed', started_at: started, completed_at: ended }];
    case 'partial':
      return [
        interceptorDone,
        { scanner: 'tracer', status: 'failed', started_at: started, completed_at: ended, error: failure }
      ];
    case 'failed':
      return [
        { scanner: 'interceptor', status: 'failed', started_at: started, completed_at: ended, error: failure },
        { scanner: 'tracer', status: 'failed', started_at: started, completed_at: ended, error: failure }
      ];
    case 'cancelled':
      return [
        { scanner: 'interceptor', status: 'cancelled', started_at: started, completed_at: ended, error: 'cancelled' },
        { scanner: 'tracer', status: 'cancelled', started_at: started, completed_at: ended, error: 'cancelled' }
      ];
  }
}

/** Fills in what the server derives: the app's name, the counts and the jobs. */
function buildScan(
  fields: Omit<ScanDetail, 'name' | 'blocker_count' | 'service_count' | 'jobs'>,
  services: Service[],
  error?: string
): ScanDetail {
  const scan: ScanDetail = {
    ...fields,
    name: APP_NAMES[fields.app_id] ?? fields.app_id,
    blocker_count: services.filter((s) => s.severity === 'blocker').length,
    service_count: services.length,
    jobs: []
  };
  scan.jobs = makeJobs(scan, error);
  return scan;
}

// ----- Fixture 1: Clean scan -----
export const cleanScan: ScanFixture = (() => {
  const url = 'https://payroll.intranet.contoso.com';
  const services = HOSTS.slice(0, 12).map((h, i) =>
    makeService(h, CLEARED_ROTATION[i % CLEARED_ROTATION.length]!, i, { pageBase: url, published: i === 4 })
  );
  const scan = buildScan(
    {
      id: 'scn_clean_001',
      app_id: 'app_payroll',
      url,
      status: 'completed',
      started_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      completed_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      started_by: 'jchen',
      duration_ms: 134_000,
      pages_crawled: 22,
      auth_methods_identified: 5
    },
    services
  );
  return { scan, services, events: scriptEvents(scan, services, false) };
})();

// ----- Fixture 2: Blocked scan -----
export const blockedScan: ScanFixture = (() => {
  const url = 'https://legacy-erp.contoso.com';
  const blockers = [
    makeService('auth.contoso.com', 'ntlm', 0, { pageBase: url, foundBy: ['interceptor', 'tracer'] }),
    makeService('legacy-erp.contoso.com', 'ntlm', 1, { pageBase: url, foundBy: ['interceptor'] }),
    makeService('print.contoso.com', 'basic', 2, { pageBase: url, foundBy: ['tracer'] })
  ];
  const reviews = HOSTS.slice(2, 7).map((h, i) =>
    makeService(h, REVIEW_ROTATION[i % REVIEW_ROTATION.length]!, i + 3, { pageBase: url })
  );
  // Already corrected by hand, so the manual marker and Undo have demo data:
  // the scanners' unknown filled in, and a negotiate named as Kerberos.
  reviews[1] = corrected(reviews[1]!, 'oauth');
  reviews[4] = corrected(reviews[4]!, 'kerberos');
  const cleared = HOSTS.slice(7, 15).map((h, i) =>
    makeService(h, CLEARED_ROTATION[i % CLEARED_ROTATION.length]!, i + 8, {
      pageBase: url,
      published: i === 0 || i === 3
    })
  );
  const services = [...blockers, ...reviews, ...cleared];
  const scan = buildScan(
    {
      id: 'scn_blocked_002',
      app_id: 'app_legacy_erp',
      url,
      status: 'completed',
      started_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      completed_at: new Date(Date.now() - 1000 * 60 * 56).toISOString(),
      started_by: 'kpatel',
      duration_ms: 224_000,
      pages_crawled: 41,
      auth_methods_identified: 6
    },
    services
  );
  return { scan, services, events: scriptEvents(scan, services, false) };
})();

// ----- Fixture 3: Running scan -----
export const runningScan: ScanFixture = (() => {
  const url = 'https://tools.staging.contoso.com';
  const services = HOSTS.slice(0, 6).map((h, i) =>
    makeService(h, i === 0 ? 'ntlm' : REVIEW_ROTATION[i % REVIEW_ROTATION.length]!, i, { pageBase: url })
  );
  const scan = buildScan(
    {
      id: 'scn_running_003',
      app_id: 'app_internal_tools',
      url,
      status: 'running',
      started_at: new Date(Date.now() - 1000 * 12).toISOString(),
      started_by: 'mhaskins',
      pages_crawled: 8,
      auth_methods_identified: 4
    },
    services
  );
  return { scan, services, events: scriptRunningEvents(scan, services) };
})();

// ----- Fixture 4: Failed scan -----
export const failedScan: ScanFixture = (() => {
  const url = 'https://finops.intranet.contoso.com';
  const error = 'TLS handshake failed: contoso-root-ca expired';
  const services = HOSTS.slice(0, 3).map((h, i) =>
    makeService(h, CLEARED_ROTATION[i % CLEARED_ROTATION.length]!, i, { pageBase: url })
  );
  const scan = buildScan(
    {
      id: 'scn_failed_004',
      app_id: 'app_finops',
      url,
      status: 'failed',
      started_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      completed_at: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
      started_by: 'rjones',
      duration_ms: 96_000,
      pages_crawled: 4,
      auth_methods_identified: 2
    },
    services,
    error
  );
  const events = scriptEvents(scan, services, true).slice(0, 30);
  const tEnd = new Date(scan.completed_at!).getTime();
  events.push(makeEvent(scan.id, String(events.length), 'job_failed', { scanner: 'interceptor', error }, tEnd - 100));
  events.push(makeEvent(scan.id, String(events.length), 'job_failed', { scanner: 'tracer', error }, tEnd - 50));
  events.push(makeEvent(scan.id, String(events.length), 'scan_failed', { error }, tEnd));
  return { scan, services, events };
})();

// ----- Fixture 5: Massive scan -----
export const massiveScan: ScanFixture = (() => {
  const url = 'https://megaportal.contoso.com';
  const services: Service[] = [];
  for (let i = 0; i < 5000; i++) {
    const host = `service-${i.toString().padStart(4, '0')}.contoso.com`;
    const auth: AuthMethod =
      i % 250 === 0
        ? 'ntlm'
        : i % 7 === 0
        ? REVIEW_ROTATION[i % REVIEW_ROTATION.length]!
        : CLEARED_ROTATION[i % CLEARED_ROTATION.length]!;
    services.push(makeService(host, auth, i, { pageBase: url }));
  }
  const scan = buildScan(
    {
      id: 'scn_massive_005',
      app_id: 'app_megaportal',
      url,
      status: 'completed',
      started_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
      completed_at: new Date(Date.now() - 1000 * 60 * 200).toISOString(),
      started_by: 'tanaka',
      duration_ms: 2_400_000,
      pages_crawled: 1300,
      auth_methods_identified: 8
    },
    services
  );
  return { scan, services, events: scriptMassiveEvents(scan, services) };
})();

// ----- Fixture 6: Partial scan -----
// The interceptor finished and the tracer timed out, so every service was
// found by the interceptor alone. Terminal, but it can only be rerun.
export const partialScan: ScanFixture = (() => {
  const url = 'https://timesheets.intranet.contoso.com';
  const error = 'ScanTimeout: tracer exceeded 900s';
  const auths: AuthMethod[] = ['oauth', 'unknown', 'bearer', 'kerberos', 'negotiate'];
  const services = HOSTS.slice(0, 5).map((h, i) =>
    makeService(h, auths[i]!, i, { pageBase: url, foundBy: ['interceptor'] })
  );
  const scan = buildScan(
    {
      id: 'scn_partial_006',
      app_id: 'app_timesheets',
      url,
      status: 'partial',
      started_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      completed_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      started_by: 'adiaz',
      duration_ms: 900_000,
      pages_crawled: 17,
      auth_methods_identified: 4
    },
    services,
    error
  );
  const events = scriptEvents(scan, services, true);
  const tEnd = new Date(scan.completed_at!).getTime();
  events.push(
    makeEvent(scan.id, String(events.length), 'job_completed', { scanner: 'interceptor', services: services.length }, tEnd - 100)
  );
  events.push(makeEvent(scan.id, String(events.length), 'job_failed', { scanner: 'tracer', error }, tEnd - 50));
  events.push(
    makeEvent(
      scan.id,
      String(events.length),
      'scan_completed',
      {
        duration_ms: scan.duration_ms,
        services: services.length,
        blockers: scan.blocker_count,
        partial: true,
        failed_scanners: ['tracer']
      },
      tEnd
    )
  );
  return { scan, services, events };
})();

export const ALL_FIXTURES = {
  clean: cleanScan,
  blocked: blockedScan,
  running: runningScan,
  failed: failedScan,
  massive: massiveScan,
  partial: partialScan
} as const;

export type FixtureKey = keyof typeof ALL_FIXTURES;

export function makeEvent(
  scanId: string,
  seq: string,
  type: ScanEvent['type'],
  payload: Record<string, unknown>,
  ts?: number
): ScanEvent {
  return { scan_id: scanId, seq, ts: ts ?? Date.now(), type, payload };
}

function scriptEvents(scan: ScanDetail, services: Service[], stopShort: boolean): ScanEvent[] {
  const events: ScanEvent[] = [];
  let seq = 0;
  const t0 = new Date(scan.started_at).getTime();
  const push = (type: ScanEvent['type'], payload: Record<string, unknown>, ts: number) =>
    events.push(makeEvent(scan.id, String(seq++), type, payload, ts));

  push('scan_started', { url: scan.url, name: scan.name }, t0);
  push('job_started', { scanner: 'interceptor' }, t0 + 100);
  push('job_started', { scanner: 'tracer' }, t0 + 120);

  let pages = 0;
  let blockers = 0;
  for (let i = 0; i < services.length; i++) {
    const s = services[i]!;
    const t = t0 + 500 + i * 600;
    pages++;
    push('page_visited', { path: pagePathOf(s), depth: 1 + (i % 3) }, t);
    push('external_service_seen', originPayload(s), t + 50);
    push(
      'request_observed',
      { host: s.host, method: 'GET', path: '/api/' + s.host.split('.')[0], status: s.evidence?.status_code ?? 200 },
      t + 100
    );
    // Each scanner announces its own verdict for the origin.
    for (const f of s.findings) {
      push('auth_detected', { ...originPayload(s), method: f.auth_method, scanner: f.scanner }, t + 150);
    }
    if (s.severity === 'blocker') {
      blockers++;
      push('blocker_found', { ...originPayload(s), auth_method: s.auth_method }, t + 200);
    }
    if (i % 4 === 0) {
      push('scan_progress', { pages, services: i + 1, blockers }, t + 250);
    }
  }
  if (!stopShort) {
    const tEnd = new Date(scan.completed_at ?? scan.started_at).getTime();
    const by = (scanner: Scanner) => services.filter((s) => s.found_by.includes(scanner)).length;
    push('job_completed', { scanner: 'interceptor', services: by('interceptor') }, tEnd - 200);
    push('job_completed', { scanner: 'tracer', services: by('tracer') }, tEnd - 100);
    push(
      'scan_completed',
      { duration_ms: scan.duration_ms ?? 0, services: services.length, blockers, partial: false, failed_scanners: [] },
      tEnd
    );
  }
  return events;
}

function scriptRunningEvents(scan: ScanDetail, services: Service[]): ScanEvent[] {
  // Pre-populated head so the live feed has *some* history when the user opens.
  // The MSW handler will push additional scripted events over ~60s when streaming.
  return scriptEvents({ ...scan, status: 'completed' }, services, true);
}

function scriptMassiveEvents(scan: ScanDetail, services: Service[]): ScanEvent[] {
  const events: ScanEvent[] = [];
  let seq = 0;
  const t0 = new Date(scan.started_at).getTime();
  const push = (type: ScanEvent['type'], payload: Record<string, unknown>, ts: number) =>
    events.push(makeEvent(scan.id, String(seq++), type, payload, ts));
  push('scan_started', { url: scan.url, name: scan.name }, t0);
  push('job_started', { scanner: 'interceptor' }, t0 + 100);
  push('job_started', { scanner: 'tracer' }, t0 + 120);
  // Simulate 8000 events: not every service emits, but many do.
  for (let i = 0; i < 8000; i++) {
    const s = services[i % services.length]!;
    const t = t0 + i * 250;
    const r = i % 5;
    if (r === 0) push('page_visited', { path: pagePathOf(s), depth: i % 4 }, t);
    else if (r === 1) push('external_service_seen', originPayload(s), t);
    else if (r === 2) push('request_observed', { host: s.host, method: 'GET', status: 200 }, t);
    else if (r === 3)
      push('auth_detected', { ...originPayload(s), method: s.auth_method, scanner: s.found_by[0] ?? 'interceptor' }, t);
    else push('scan_progress', { pages: i, services: i / 2, blockers: 20 }, t);
  }
  const tEnd = new Date(scan.completed_at!).getTime();
  push('job_completed', { scanner: 'interceptor', services: services.length }, tEnd - 200);
  push('job_completed', { scanner: 'tracer', services: services.length }, tEnd - 100);
  push(
    'scan_completed',
    {
      duration_ms: scan.duration_ms,
      services: services.length,
      blockers: scan.blocker_count,
      partial: false,
      failed_scanners: []
    },
    tEnd
  );
  return events;
}

export function fixtureSummaries(): ScanSummary[] {
  return [
    summary(blockedScan.scan),
    summary(runningScan.scan),
    summary(cleanScan.scan),
    summary(failedScan.scan),
    summary(partialScan.scan),
    summary(massiveScan.scan)
  ];
}

function summary(s: ScanDetail): ScanSummary {
  return {
    id: s.id,
    app_id: s.app_id,
    name: s.name,
    url: s.url,
    status: s.status,
    started_at: s.started_at,
    completed_at: s.completed_at,
    started_by: s.started_by,
    blocker_count: s.blocker_count,
    service_count: s.service_count
  };
}
