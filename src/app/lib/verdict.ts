import type { AuthMethod, Service, Severity } from '@core/models';

/**
 * Mirror of the backend's `severity_for` (core/translate.py) so optimistic
 * updates move a service into the right group instantly. Must stay in sync.
 *
 * A whitelist: only the named, supported schemes clear. NTLM and Basic are
 * known to be unsupported and block, and so does `other`, a real scheme the
 * scanner could not name. Everything else is review: what cannot be told yet.
 * Never returns `published`; that comes from the registry, not from a method.
 */
export function severityForAuthMethod(method: AuthMethod): Severity {
  switch (method) {
    case 'ntlm':
    case 'basic':
    case 'other':
      return 'blocker';
    case 'kerberos':
    case 'bearer':
    case 'oauth':
    case 'login_redirect':
    case 'api_key':
    case 'unauthenticated':
      return 'cleared';
    default:
      return 'review';
  }
}

/**
 * The answers the scanners leave when they cannot tell the method. The manual
 * auth-method override exists to fill these in, see `manualAuthTargets`.
 */
const UNRESOLVED: ReadonlySet<AuthMethod> = new Set<AuthMethod>(['unknown', 'no_response', 'dns_failed']);

export function isUnresolvedAuthMethod(method: AuthMethod): boolean {
  return UNRESOLVED.has(method);
}

/**
 * The methods a person can fill in for an unresolved verdict: every concrete
 * scheme in the backend's vocabulary. negotiate is left out although the
 * backend accepts it, because it is itself unresolved SPNEGO: the person picks
 * the mechanism, Kerberos or NTLM, instead.
 */
const FILL_IN_TARGETS: readonly AuthMethod[] = [
  'ntlm',
  'kerberos',
  'oauth',
  'login_redirect',
  'bearer',
  'api_key',
  'basic',
  'other',
  'unauthenticated'
];

/** negotiate is SPNEGO whose mechanism went unresolved, so only the mechanism may be named. */
const NEGOTIATE_TARGETS: readonly AuthMethod[] = ['kerberos', 'ntlm'];

/**
 * What a person may set a service's auth method to, by the scanners' verdict
 * for it (`scanners_auth_method`), not by its current label, so a correction
 * can be corrected again. Null where the verdict is a detected method and
 * stays locked. Mirrors the backend's `_MANUAL_AUTH_TARGETS`
 * (api/routes_scans.py); setting the verdict itself, which undoes a
 * correction, is allowed on top of these.
 */
export function manualAuthTargets(verdict: AuthMethod | null | undefined): readonly AuthMethod[] | null {
  if (verdict == null) return null;
  if (isUnresolvedAuthMethod(verdict)) return FILL_IN_TARGETS;
  if (verdict === 'negotiate') return NEGOTIATE_TARGETS;
  return null;
}

/** Whether the backend accepts setting the service's auth method to `method`. */
export function canSetAuthMethod(
  s: Pick<Service, 'scanners_auth_method'>,
  method: AuthMethod
): boolean {
  const targets = manualAuthTargets(s.scanners_auth_method);
  return targets !== null && (method === s.scanners_auth_method || targets.includes(method));
}

/**
 * The scanners' verdict when a person has set the label to something else,
 * which is what undoing the correction restores; null when the label is the
 * scanners' own.
 */
export function correctedFrom(s: Pick<Service, 'auth_method' | 'scanners_auth_method'>): AuthMethod | null {
  const verdict = s.scanners_auth_method;
  return verdict != null && verdict !== s.auth_method ? verdict : null;
}

/**
 * Whether the service keeps its scan from being submitted: a bandit, or a
 * bogey no one has filled in, unless it is excluded. Mirrors the backend's
 * `UNRESOLVED_SEVERITIES` (core/db.py), which its submit route refuses on.
 */
export function blocksSubmit(s: Pick<Service, 'severity' | 'excluded'>): boolean {
  return !s.excluded && (s.severity === 'blocker' || s.severity === 'review');
}

export function severityColor(severity: Severity): string {
  switch (severity) {
    case 'blocker':
      return 'var(--color-danger)';
    case 'review':
      return 'var(--color-warn)';
    case 'cleared':
      return 'var(--color-success)';
    case 'published':
      return 'var(--color-accent)';
  }
}

/**
 * Colour of an auth-method pill: its severity's, except `unauthenticated`,
 * which clears but reads as "open" rather than "safe".
 */
export function authMethodColor(method: AuthMethod): string {
  if (method === 'unauthenticated') return 'var(--color-info)';
  return severityColor(severityForAuthMethod(method));
}

/**
 * The pill's text. Every unresolved method reads UNKNOWN: `no_response` and
 * `dns_failed` are reasons the scanner could not tell the method, not methods,
 * and the pill answers "which method". The reason itself is for the detail
 * panel, see `unresolvedReason`.
 */
export function authMethodLabel(method: AuthMethod): string {
  if (isUnresolvedAuthMethod(method)) return 'UNKNOWN';
  return method.replace(/_/g, ' ').toUpperCase();
}

/**
 * Why an unresolved method is unresolved, in the reviewer's terms. Derived
 * from the verdict alone, so it can be shown whether or not the service kept
 * a request as evidence. Null for a resolved method.
 */
export function unresolvedReason(method: AuthMethod): string | null {
  switch (method) {
    case 'dns_failed':
      return "The host name didn't resolve, so the method couldn't be checked.";
    case 'no_response':
      return "The host didn't respond, so the method couldn't be checked.";
    case 'unknown':
      return "The scan couldn't classify the response.";
    default:
      return null;
  }
}

/**
 * Why the scanners' verdict leaves the method for a person to name: the
 * unresolved reason, or for negotiate that the SPNEGO mechanism is unknown.
 * Null for a detected method.
 */
export function correctableReason(verdict: AuthMethod): string | null {
  if (verdict === 'negotiate') {
    return "The service offered Negotiate (SPNEGO), but whether it settles on Kerberos or NTLM couldn't be told.";
  }
  return unresolvedReason(verdict);
}
