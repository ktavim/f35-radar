import { describe, expect, it } from 'vitest';
import { formatEvent } from './event-format';
import type { ScanEvent } from '@core/models';

describe('formatEvent', () => {
  it('produces a BANDIT line for blocker_found', () => {
    const evt: ScanEvent = {
      scan_id: 's',
      seq: '1',
      ts: Date.UTC(2024, 0, 1, 14, 32, 8, 44),
      type: 'blocker_found',
      payload: { host: 'auth.contoso.com', reason: 'ntlm — disallowed auth method' }
    };
    const line = formatEvent(evt);
    expect(line.type).toBe('BANDIT');
    expect(line.host).toBe('auth.contoso.com');
    expect(line.message).toBe('ntlm — disallowed auth method');
  });
  it('produces an ERROR line for scan_failed', () => {
    // ERROR is the scanner failing, not a finding: keeps it distinct from BANDIT.
    const evt: ScanEvent = {
      scan_id: 's',
      seq: '5',
      ts: Date.now(),
      type: 'scan_failed',
      payload: { error: 'target unreachable' }
    };
    const line = formatEvent(evt);
    expect(line.type).toBe('ERROR');
    expect(line.message).toBe('scan failed · target unreachable');
  });
  it('produces an INFO line for auth_detected', () => {
    const evt: ScanEvent = {
      scan_id: 's',
      seq: '2',
      ts: Date.now(),
      type: 'auth_detected',
      payload: { host: 'api.contoso.com', method: 'ntlm' }
    };
    expect(formatEvent(evt).type).toBe('INFO');
    expect(formatEvent(evt).message).toContain('detected');
    expect(formatEvent(evt).message).toContain('ntlm detected');
  });
  it('produces an INFO line for external_service_seen', () => {
    const evt: ScanEvent = {
      scan_id: 's',
      seq: '3',
      ts: Date.now(),
      type: 'external_service_seen',
      payload: { scheme: 'https', host: 'api.contoso.com', port: 8443 }
    };
    const line = formatEvent(evt);
    expect(line.type).toBe('INFO');
    expect(line.host).toBe('api.contoso.com');
    expect(line.message).toBe('first seen');
  });
  it('reads the services count from scan_progress', () => {
    // Pins the payload key: the server sends `services`, and a mismatch here
    // renders as "services=undefined" rather than failing anywhere.
    const evt: ScanEvent = {
      scan_id: 's',
      seq: '4',
      ts: Date.now(),
      type: 'scan_progress',
      payload: { pages: 3, services: 7, blockers: 1 }
    };
    expect(formatEvent(evt).message).toBe('scan progress · pages=3 services=7 bandits=1');
  });
});
