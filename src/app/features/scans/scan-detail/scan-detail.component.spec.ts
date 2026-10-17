import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/angular';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BehaviorSubject, Subject } from 'rxjs';
import { ScanDetailComponent } from './scan-detail.component';
import { ScansApi } from '../data/scans.api';
import { AuthService } from '@core/services/auth.service';
import { SseService, type ConnectionState, type SseStream } from '@lib/sse.service';
import type { ScanDetail, ScanEvent } from '@core/models';

// A controllable stand-in for SseService: hands back a stream whose events can
// be pushed on demand, and records whether the consumer closed it. close()
// completes the event subject, mirroring EventSource.close() dropping any
// not-yet-delivered messages — so a premature close genuinely loses events.
class FakeSseHandle {
  readonly events$ = new Subject<ScanEvent>();
  readonly state$ = new BehaviorSubject<ConnectionState>('live');
  readonly close = vi.fn(() => {
    this.state$.next('closed');
    this.events$.complete();
  });
  readonly stream: SseStream = {
    events$: this.events$.asObservable(),
    state$: this.state$.asObservable(),
    toLatestEventSignal: () => signal<ScanEvent | undefined>(undefined),
    toStateSignal: () => signal<ConnectionState>('idle'),
    close: this.close
  };
  emit(evt: ScanEvent) {
    this.events$.next(evt);
  }
}

class FakeSseService {
  readonly handles: FakeSseHandle[] = [];
  open(_url: string): SseStream {
    const handle = new FakeSseHandle();
    this.handles.push(handle);
    return handle.stream;
  }
}

function makeScan(status: ScanDetail['status'], id = `scn_${status}`): ScanDetail {
  const terminal = status !== 'running' && status !== 'queued';
  return {
    id,
    app_id: 'app_x',
    name: 'App X',
    url: 'https://app.intranet.contoso.com',
    status,
    started_at: new Date('2026-06-29T12:00:00Z').toISOString(),
    completed_at: terminal ? new Date('2026-06-29T12:02:00Z').toISOString() : undefined,
    started_by: 'tester',
    blocker_count: 0,
    review_count: 0,
    service_count: 0,
    duration_ms: 96_000,
    pages_crawled: 4,
    auth_methods_identified: 0,
    jobs: []
  };
}

function makeEvent(
  scanId: string,
  seq: string,
  type: ScanEvent['type'],
  payload: Record<string, unknown>
): ScanEvent {
  return { scan_id: scanId, seq, ts: 0, type, payload };
}

async function setup(scan: ScanDetail) {
  const fakeSse = new FakeSseService();
  const apiStub: Partial<ScansApi> = {
    getScan: vi.fn().mockResolvedValue(scan),
    getFindings: vi.fn().mockResolvedValue([]),
    getAppScans: vi.fn().mockResolvedValue([])
  };
  const view = await render(ScanDetailComponent, {
    inputs: { id: scan.id },
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideTanStackQuery(new QueryClient()),
      { provide: ScansApi, useValue: apiStub },
      { provide: SseService, useValue: fakeSse },
      { provide: AuthService, useValue: { currentUser: signal(null) } }
    ]
  });
  return { view, cmp: view.fixture.componentInstance, fakeSse };
}

// Regression: a scan that failed early (e.g. at login) is already `failed` by
// the time scan-detail loads, so isTerminal() flips true from the GET-backed
// query *before* the SSE replay carrying scan_failed arrives. The dock must not
// be torn down on that signal, or the failure line is dropped and the live feed
// shows nothing — the original bug.
describe('ScanDetailComponent — terminal scan stream lifecycle', () => {
  it('does not close the SSE stream before the replayed scan_failed event lands', async () => {
    const scan = makeScan('failed');
    const { view, cmp, fakeSse } = await setup(scan);

    await waitFor(() => expect(fakeSse.handles.length).toBe(1));
    const handle = fakeSse.handles[0]!;

    // The query resolves to a terminal status before any SSE event is delivered.
    await waitFor(() => expect(cmp.isTerminal()).toBe(true));
    expect(handle.close).not.toHaveBeenCalled();

    // Now the replay arrives, ending in scan_failed.
    handle.emit(makeEvent(scan.id, '0', 'scan_started', { url: scan.url }));
    handle.emit(makeEvent(scan.id, '1', 'scan_failed', { error: 'RuntimeError: login failed' }));
    view.detectChanges();

    const failure = cmp.events().find((e) => e.type === 'scan_failed');
    expect(failure).toBeDefined();
    expect(failure!.payload['error']).toBe('RuntimeError: login failed');

    // Having consumed the terminal event, the handler now closes the stream.
    expect(handle.close).toHaveBeenCalled();
  });

  it('starts the terminal dock expanded for a failed scan', async () => {
    const { cmp } = await setup(makeScan('failed'));
    await waitFor(() => expect(cmp.isFailed()).toBe(true));
    expect(cmp.dockStartsCollapsed()).toBe(false);
  });

  it('starts the terminal dock collapsed for a completed scan', async () => {
    const { cmp } = await setup(makeScan('completed'));
    await waitFor(() => expect(cmp.isTerminal()).toBe(true));
    expect(cmp.dockStartsCollapsed()).toBe(true);
  });

  // A partial scan has ended (one scanner completed, the other failed), so the
  // dock collapses and the stream fallback applies, but it is not submittable.
  it('treats a partial scan as terminal but not completed', async () => {
    const { cmp } = await setup(makeScan('partial'));
    await waitFor(() => expect(cmp.isTerminal()).toBe(true));
    expect(cmp.isCompleted()).toBe(false);
    expect(cmp.dockStartsCollapsed()).toBe(true);
  });
});

describe('ScanDetailComponent — live counters', () => {
  it('counts an external service per (scheme, host, port), not per host', async () => {
    const scan = makeScan('running');
    const { cmp, fakeSse } = await setup(scan);
    await waitFor(() => expect(fakeSse.handles.length).toBe(1));
    await waitFor(() => expect(cmp.isRunning()).toBe(true));
    const handle = fakeSse.handles[0]!;

    const seen = (seq: string, scheme: string, host: string, port: number) =>
      handle.emit(makeEvent(scan.id, seq, 'external_service_seen', { scheme, host, port }));
    seen('0', 'http', 'svc.internal', 80);
    seen('1', 'https', 'svc.internal', 443);
    seen('2', 'https', 'svc.internal', 8443);
    seen('3', 'https', 'cdn.contoso.com', 443);
    // A replayed/duplicate announcement of a known service adds nothing.
    seen('4', 'https', 'svc.internal', 443);

    // Two hostnames, four services: must agree with the server's
    // service_count, which is one per origin.
    expect(cmp.counters().services).toBe(4);
  });
});
