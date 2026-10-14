import { describe, it, expect } from 'vitest';
import { authMethodLabel, isUnresolvedAuthMethod, unresolvedReason } from './verdict';
import type { AuthMethod } from '@core/models';

const ALL: AuthMethod[] = [
  'ntlm',
  'kerberos',
  'negotiate',
  'oauth',
  'login_redirect',
  'basic',
  'bearer',
  'api_key',
  'other',
  'unauthenticated',
  'no_response',
  'dns_failed',
  'unknown'
];

describe('authMethodLabel', () => {
  it('reads UNKNOWN for every unresolved method, so the pill answers "which method" only', () => {
    expect(authMethodLabel('unknown')).toBe('UNKNOWN');
    expect(authMethodLabel('no_response')).toBe('UNKNOWN');
    expect(authMethodLabel('dns_failed')).toBe('UNKNOWN');
  });

  it('spells a resolved method out in upper case with spaces', () => {
    expect(authMethodLabel('login_redirect')).toBe('LOGIN REDIRECT');
    expect(authMethodLabel('api_key')).toBe('API KEY');
    expect(authMethodLabel('ntlm')).toBe('NTLM');
  });
});

describe('unresolvedReason', () => {
  it('names the reason for each unresolved method', () => {
    expect(unresolvedReason('dns_failed')).toMatch(/didn't resolve/);
    expect(unresolvedReason('no_response')).toMatch(/didn't respond/);
    expect(unresolvedReason('unknown')).toMatch(/couldn't classify/);
  });

  it('has a reason exactly for the methods that are unresolved', () => {
    for (const method of ALL) {
      expect(unresolvedReason(method) !== null, method).toBe(isUnresolvedAuthMethod(method));
    }
  });
});
