import { describe, it, expect } from 'vitest';
import {
  authMethodLabel,
  canSetAuthMethod,
  correctableReason,
  correctedFrom,
  isUnresolvedAuthMethod,
  manualAuthTargets,
  unresolvedReason
} from './verdict';
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

describe('manualAuthTargets', () => {
  it('lets every concrete method fill in an unresolved verdict, but never an unresolved one or negotiate', () => {
    for (const verdict of ['unknown', 'no_response', 'dns_failed'] as AuthMethod[]) {
      const targets = manualAuthTargets(verdict)!;
      expect(targets).toContain('ntlm');
      expect(targets).toContain('unauthenticated');
      expect(targets.some((m) => isUnresolvedAuthMethod(m) || m === 'negotiate')).toBe(false);
    }
  });

  it('lets a negotiate be named as its mechanism only', () => {
    expect(manualAuthTargets('negotiate')).toEqual(['kerberos', 'ntlm']);
  });

  it('locks a detected method, and a service with no verdict', () => {
    for (const method of ALL) {
      if (isUnresolvedAuthMethod(method) || method === 'negotiate') continue;
      expect(manualAuthTargets(method), method).toBeNull();
    }
    expect(manualAuthTargets(null)).toBeNull();
    expect(manualAuthTargets(undefined)).toBeNull();
  });
});

describe('canSetAuthMethod', () => {
  it('allows a target, and the verdict itself to undo a correction', () => {
    expect(canSetAuthMethod({ scanners_auth_method: 'negotiate' }, 'kerberos')).toBe(true);
    expect(canSetAuthMethod({ scanners_auth_method: 'negotiate' }, 'negotiate')).toBe(true);
    expect(canSetAuthMethod({ scanners_auth_method: 'unknown' }, 'unknown')).toBe(true);
  });

  it('refuses a method outside the verdict’s targets, and any change to a detected method', () => {
    expect(canSetAuthMethod({ scanners_auth_method: 'negotiate' }, 'oauth')).toBe(false);
    expect(canSetAuthMethod({ scanners_auth_method: 'ntlm' }, 'kerberos')).toBe(false);
    expect(canSetAuthMethod({ scanners_auth_method: 'ntlm' }, 'ntlm')).toBe(false);
    expect(canSetAuthMethod({ scanners_auth_method: null }, 'ntlm')).toBe(false);
  });
});

describe('correctedFrom', () => {
  it('names the scanners’ verdict only when a person changed the label', () => {
    expect(correctedFrom({ auth_method: 'kerberos', scanners_auth_method: 'negotiate' })).toBe('negotiate');
    expect(correctedFrom({ auth_method: 'negotiate', scanners_auth_method: 'negotiate' })).toBeNull();
    expect(correctedFrom({ auth_method: 'ntlm', scanners_auth_method: null })).toBeNull();
  });
});

describe('correctableReason', () => {
  it('has a reason exactly for the verdicts a person may correct', () => {
    for (const method of ALL) {
      expect(correctableReason(method) !== null, method).toBe(manualAuthTargets(method) !== null);
    }
  });
});
