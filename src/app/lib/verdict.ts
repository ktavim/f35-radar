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

export function authMethodLabel(method: AuthMethod): string {
  return method.replace(/_/g, ' ').toUpperCase();
}
