export type ScanStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type Scanner = 'interceptor' | 'tracer';

export type AuthMethod =
  | 'ntlm'
  | 'kerberos'
  | 'negotiate'
  | 'oauth'
  | 'login_redirect'
  | 'basic'
  | 'bearer'
  | 'api_key'
  | 'other'
  | 'unauthenticated'
  | 'no_response'
  | 'dns_failed'
  | 'unknown';

/**
 * `published` comes only from the published-origins registry and overrides
 * whatever method was detected: the origin is already published through the
 * F5, so nothing is left to configure. `cleared` means the F5 can publish it
 * and someone still has to.
 */
export type Severity = 'blocker' | 'review' | 'cleared' | 'published';

/**
 * Where a scanner found a service's origin. The first five are the tracer's
 * provenance kinds; `page` is the interceptor's, a page its browser was on
 * when it called the origin.
 */
export type SourceKind = 'network' | 'js' | 'dom' | 'redirect' | 'synthesized' | 'page';

/**
 * One request behind a service: a request the browser made, captured by the
 * interceptor, or a probe the tracer sent.
 */
export interface ServiceUrl {
  id: string;
  scanner: Scanner;
  method: string;
  url: string;
  resource_type: string;
  status_code: number;
  /** The browser's error text when the request got no response (status_code 0). */
  failure_reason?: string | null;
  auth_method: AuthMethod;
  sent_auth_scheme?: string | null;
  auth_challenge?: string | null;
  /** A redirect's target, query, fragment and userinfo stripped. */
  redirect_url?: string | null;
  page_url: string;
  /** The tracer's raw provenance strings; empty for the interceptor. */
  sources: string[];
}

export interface ServiceSource {
  kind: SourceKind;
  value: string;
}

/** One scanner's own verdict for a service's origin. */
export interface Finding {
  scanner: Scanner;
  auth_method: AuthMethod;
  severity: Severity;
  /** The request, one of this scanner's, whose classification is the verdict. */
  evidence?: ServiceUrl | null;
}

/** An origin as the services table keys it. */
export interface ServiceOrigin {
  scheme: string;
  host: string;
  port: number;
}

/** An entry of the published-origins registry. */
export interface PublishedOrigin extends ServiceOrigin {
  id: string;
  note: string;
  added_by: string;
  added_at: string;
  /** Set once the entry is removed; a service on a submitted scan keeps pointing at it. */
  removed_at?: string | null;
  removed_by?: string | null;
}

/**
 * An origin a scan found, with the combined verdict of the scanners' findings
 * (until a person fills in one the scanners could not tell, or names the
 * mechanism of a negotiate).
 */
export interface Service extends ServiceOrigin {
  id: string;
  auth_method: AuthMethod;
  /**
   * The combined verdict itself, whatever the label was set to since: where
   * it differs from auth_method, a person set the label, and setting it back
   * undoes that. Null only for a service with no findings.
   */
  scanners_auth_method?: AuthMethod | null;
  /** The method's severity, or `published` from the registry whatever the method. */
  severity: Severity;
  request_count: number;
  ips?: string[] | null;
  /** The request whose classification won the merge; null for a service with no such row. */
  evidence?: ServiceUrl | null;
  /** The scanners that found the origin, and each one's own verdict for it. */
  found_by: Scanner[];
  findings: Finding[];
  /** Everywhere the scanners found the origin, one entry per distinct source. */
  sources: ServiceSource[];
  excluded: boolean;
  /** The registry entry that made the service published; null under every other severity. */
  published_origin?: PublishedOrigin | null;
}

export interface ScanSummary {
  id: string;
  app_id: string;
  name: string;
  url: string;
  status: ScanStatus;
  started_at: string;
  completed_at?: string | null;
  started_by: string;
  /** Services not excluded, by severity. Either one above 0 refuses submit. */
  blocker_count: number;
  review_count: number;
  service_count: number;
  submitted_at?: string | null;
  submitted_by?: string | null;
}

/** One scanner's run of a scan. */
export interface ScanJob {
  scanner: Scanner;
  status: JobStatus;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  /** Null until the job completes, and for the tracer, which counts no pages. */
  pages_crawled?: number | null;
}

export interface ScanDetail extends ScanSummary {
  duration_ms?: number | null;
  /** The interceptor job's; 0 until it completes. */
  pages_crawled?: number | null;
  auth_methods_identified?: number | null;
  jobs: ScanJob[];
}

export type ScanEventType =
  | 'scan_started'
  | 'job_started'
  | 'job_requeued'
  | 'job_completed'
  | 'job_failed'
  | 'page_visited'
  | 'request_observed'
  | 'external_service_seen'
  | 'auth_detected'
  | 'blocker_found'
  | 'scan_progress'
  | 'scan_completed'
  | 'scan_failed';

export interface ScanEvent {
  scan_id: string;
  seq: string;
  ts: number;
  type: ScanEventType;
  payload: Record<string, unknown>;
}

export interface ExclusionChange extends ServiceOrigin {
  id: string;
  before: boolean;
  after: boolean;
}

export interface AuthMethodChange extends ServiceOrigin {
  id: string;
  before: AuthMethod;
  after: AuthMethod;
}

/** A service that became, or stopped being, published between two scans. */
export interface PublishedChange extends ServiceOrigin {
  id: string;
  before: boolean;
  after: boolean;
}

export interface ScanDiff {
  from_scan_id: string;
  to_scan_id: string;
  added: Service[];
  removed: Service[];
  exclusion_changes: ExclusionChange[];
  auth_method_changes: AuthMethodChange[];
  published_changes: PublishedChange[];
}

export interface CreateScanRequest {
  app_id: string;
  max_depth?: number;
}
