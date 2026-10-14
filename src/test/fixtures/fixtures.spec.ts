import { describe, expect, it } from 'vitest';
import * as webStreams from 'node:stream/web';
import { ALL_FIXTURES, fixtureSummaries } from './index';
import { severityForAuthMethod } from '@lib/verdict';

// jsdom has no WritableStream, and msw's SSE module wants one at import time.
// Borrow Node's before loading the handlers, which is why that import is dynamic.
for (const name of ['ReadableStream', 'WritableStream', 'TransformStream'] as const) {
  if (!(name in globalThis)) Object.assign(globalThis, { [name]: webStreams[name] });
}
const { handlers } = await import('../msw/handlers');

// The fixtures feed the dev server through MSW and nothing else imports them,
// so a construction error would only surface in the browser. Build them here
// and check the invariants the real server guarantees.
describe('scan fixtures', () => {
  const fixtures = Object.values(ALL_FIXTURES);

  it('derive the scan counts from the services', () => {
    for (const { scan, services } of fixtures) {
      expect(scan.service_count).toBe(services.length);
      expect(scan.blocker_count).toBe(services.filter((s) => s.severity === 'blocker').length);
      expect(scan.name).not.toBe('');
      expect(scan.jobs.map((j) => j.scanner).sort()).toEqual(['interceptor', 'tracer']);
    }
  });

  it("give every service the severity of its method, unless the registry published it", () => {
    for (const { services } of fixtures) {
      for (const s of services) {
        if (s.severity === 'published') {
          expect(s.published_origin).not.toBeNull();
          continue;
        }
        expect(s.published_origin).toBeNull();
        expect(s.severity).toBe(severityForAuthMethod(s.auth_method));
        // Each scanner's own verdict is for the same method, and its evidence
        // is one of that scanner's rows.
        expect(s.findings.map((f) => f.scanner)).toEqual(s.found_by);
        for (const f of s.findings) expect(f.evidence?.scanner).toBe(f.scanner);
      }
    }
  });

  it('include a published service and a partial scan so both states have demo data', () => {
    expect(ALL_FIXTURES.blocked.services.some((s) => s.severity === 'published')).toBe(true);
    const partial = ALL_FIXTURES.partial;
    expect(partial.scan.status).toBe('partial');
    expect(partial.scan.jobs.find((j) => j.scanner === 'tracer')?.status).toBe('failed');
    expect(partial.scan.jobs.find((j) => j.scanner === 'interceptor')?.status).toBe('completed');
    const done = partial.events.at(-1)!;
    expect(done.type).toBe('scan_completed');
    expect(done.payload['partial']).toBe(true);
    expect(done.payload['failed_scanners']).toEqual(['tracer']);
  });

  it('end every completed scan with the server-shaped scan_completed payload', () => {
    for (const { scan, events } of fixtures) {
      if (scan.status !== 'completed') continue;
      const done = events.at(-1)!;
      expect(done.type).toBe('scan_completed');
      expect(done.payload['services']).toBe(scan.service_count);
      expect(done.payload['blockers']).toBe(scan.blocker_count);
    }
  });

  it('list every fixture in the scan summaries', () => {
    const ids = fixtureSummaries().map((s) => s.id).sort();
    expect(ids).toEqual(fixtures.map((f) => f.scan.id).sort());
  });
});

describe('msw handlers', () => {
  it('mock the services routes the backend exposes', () => {
    const paths = handlers.map((h) => `${h.info.method} ${h.info.path}`);
    expect(paths).toContain('GET /api/scans/:id/services');
    expect(paths).toContain('GET /api/scans/:id/services/:serviceId/urls');
    expect(paths).toContain('PATCH /api/scans/:id/services/:serviceId');
    expect(paths.some((p) => p.includes('/findings'))).toBe(false);
  });
});
