import type { AuthMethod, Severity } from '@core/models';

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
 * auth-method override exists to fill these in; a resolved method is not
 * editable.
 */
const UNRESOLVED: ReadonlySet<AuthMethod> = new Set<AuthMethod>(['unknown', 'no_response', 'dns_failed']);

export function isUnresolvedAuthMethod(method: AuthMethod): boolean {
  return UNRESOLVED.has(method);
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
