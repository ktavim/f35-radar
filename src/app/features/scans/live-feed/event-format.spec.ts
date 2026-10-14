import { describe, expect, it } from 'vitest';
import { formatEvent } from './event-format';
import type { ScanEvent } from '@core/models';

function evt(type: ScanEvent['type'], payload: Record<string, unknown>, seq = '1'): ScanEvent {
  return { scan_id: 's', seq, ts: Date.UTC(2024, 0, 1, 14, 32, 8, 44), type, payload };
}

describe('formatEvent', () => {
  it('produces a BANDIT line for blocker_found', () => {
    // The server sends the origin and the offending method, not a prose reason.
    const line = formatEvent(
      evt('blocker_found', { scheme: 'https', host: 'auth.contoso.com', port: 443, auth_method: 'ntlm' })
    );
    expect(line.type).toBe('BANDIT');
    expect(line.host).toBe('auth.contoso.com');
    expect(line.message).toBe('ntlm · disallowed auth method');
  });
  it('produces an ERROR line for scan_failed', () => {
    // ERROR is the scanner failing, not a finding: keeps it distinct from BANDIT.
    const line = formatEvent(evt('scan_failed', { error: 'target unreachable' }));
    expect(line.type).toBe('ERROR');
    expect(line.message).toBe('scan failed · target unreachable');
  });
  it('names the reason when a scan was cancelled', () => {
    // A cancellation ends in scan_failed with `reason` rather than `error`.
    expect(formatEvent(evt('scan_failed', { reason: 'cancelled' })).message).toBe('scan failed · cancelled');
  });
  it('produces an INFO line for auth_detected, naming the scanner', () => {
    const line = formatEvent(evt('auth_detected', { host: 'api.contoso.com', method: 'ntlm', scanner: 'tracer' }));
    expect(line.type).toBe('INFO');
    expect(line.message).toBe('ntlm detected · tracer');
  });
  it('produces an INFO line for external_service_seen', () => {
    const line = formatEvent(evt('external_service_seen', { scheme: 'https', host: 'api.contoso.com', port: 8443 }));
    expect(line.type).toBe('INFO');
    expect(line.host).toBe('api.contoso.com');
    expect(line.message).toBe('first seen');
  });
  it('reads the services count from scan_progress', () => {
    // Pins the payload key: the server sends `services`, and a mismatch here
    // renders as "services=undefined" rather than failing anywhere.
    const line = formatEvent(evt('scan_progress', { pages: 3, services: 7, blockers: 1 }));
    expect(line.message).toBe('scan progress · pages=3 services=7 bandits=1');
  });
  it('produces an ERROR line for job_failed, naming the scanner', () => {
    const line = formatEvent(evt('job_failed', { scanner: 'tracer', error: 'ScanTimeout: 900s' }));
    expect(line.type).toBe('ERROR');
    expect(line.message).toBe('tracer failed · ScanTimeout: 900s');
  });
  it('reads the services count from job_completed', () => {
    const line = formatEvent(evt('job_completed', { scanner: 'interceptor', services: 12 }));
    expect(line.type).toBe('INFO');
    expect(line.message).toBe('interceptor completed · 12 services');
  });
  it('keeps a full completion as INFO and reads the services count', () => {
    const line = formatEvent(
      evt('scan_completed', { duration_ms: 1000, services: 9, blockers: 2, partial: false, failed_scanners: [] })
    );
    expect(line.type).toBe('INFO');
    expect(line.message).toBe('scan completed · 9 services · 2 bandits');
  });
  it('flags a partial completion as a WARN naming the failed scanner', () => {
    const line = formatEvent(
      evt('scan_completed', { duration_ms: 1000, services: 9, blockers: 0, partial: true, failed_scanners: ['tracer'] })
    );
    expect(line.type).toBe('WARN');
    expect(line.message).toBe('scan completed · 9 services · 0 bandits · partial, tracer failed');
  });
});
