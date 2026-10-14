import type { ScanEvent, ScanEventType } from '@core/models';

// BANDIT and ERROR are different axes, not two rungs of one ladder. BANDIT
// means the scanner found something: `blocker_found` is the only event that
// reaches it, so the log's type filter gives a one-click "show me only the
// bandits". ERROR means a scanner itself failed (`job_failed`, `scan_failed`).
export type LineType = 'VERBOSE' | 'INFO' | 'WARN' | 'BANDIT' | 'ERROR';

export interface FormattedLine {
  seq: string;
  ts: number;
  tsLabel: string;
  type: LineType;
  host: string;
  message: string;
  raw: ScanEvent;
}

const TYPE_MAP: Record<ScanEventType, LineType> = {
  scan_started: 'INFO',
  job_started: 'INFO',
  job_requeued: 'WARN',
  job_completed: 'INFO',
  job_failed: 'ERROR',
  scan_progress: 'INFO',
  scan_completed: 'INFO',
  scan_failed: 'ERROR',
  page_visited: 'VERBOSE',
  request_observed: 'VERBOSE',
  external_service_seen: 'INFO',
  auth_detected: 'INFO',
  blocker_found: 'BANDIT'
};

export function formatEvent(evt: ScanEvent): FormattedLine {
  const tsLabel = formatTime(evt.ts);
  // An event type this build does not know (a newer backend) still gets a line.
  let type: LineType = TYPE_MAP[evt.type] ?? 'INFO';
  const p = evt.payload as Record<string, unknown>;
  const str = (k: string): string | undefined => (p[k] == null ? undefined : String(p[k]));
  const scanner = str('scanner') ?? 'scanner';
  let host = '';
  let message = '';

  switch (evt.type) {
    case 'scan_started':
      message = `scan started · ${str('url') ?? ''}`;
      break;
    case 'job_started':
      message = `${scanner} started`;
      break;
    case 'job_requeued':
      message = `${scanner} requeued`;
      break;
    case 'job_completed':
      message = `${scanner} completed · ${str('services') ?? 0} services`;
      break;
    case 'job_failed':
      message = `${scanner} failed · ${str('error') ?? 'unknown error'}`;
      break;
    case 'scan_progress':
      message = `scan progress · pages=${p['pages']} services=${p['services']} bandits=${p['blockers']}`;
      break;
    case 'scan_completed': {
      message = `scan completed · ${str('services') ?? 0} services · ${str('blockers') ?? 0} bandits`;
      // A partial scan completed with a scanner's results missing: it can only
      // be rerun, so it reads as a warning rather than a plain completion.
      if (p['partial'] === true) {
        const failed = Array.isArray(p['failed_scanners']) ? (p['failed_scanners'] as unknown[]).map(String) : [];
        message += ` · partial, ${failed.length ? failed.join(', ') : 'a scanner'} failed`;
        type = 'WARN';
      }
      break;
    }
    case 'scan_failed':
      // `error` for a failure, `reason` for a cancellation.
      message = `scan failed · ${str('error') ?? str('reason') ?? 'unknown error'}`;
      break;
    case 'page_visited':
      host = str('path') ?? '';
      message = `visited (depth ${p['depth'] ?? '?'})`;
      break;
    case 'request_observed':
      host = str('host') ?? '';
      message = `${p['method'] ?? 'GET'} ${p['path'] ?? ''} ${p['status'] ?? ''}`.trim();
      break;
    case 'external_service_seen':
      host = str('host') ?? '';
      message = 'first seen';
      break;
    case 'auth_detected':
      host = str('host') ?? '';
      // Each scanner announces its own verdict for an origin.
      message = `${str('method') ?? ''} detected${str('scanner') ? ` · ${str('scanner')}` : ''}`;
      break;
    case 'blocker_found': {
      host = str('host') ?? '';
      const method = str('auth_method');
      message = method ? `${method} · disallowed auth method` : (str('reason') ?? 'disallowed auth method');
      break;
    }
  }

  return { seq: evt.seq, ts: evt.ts, tsLabel, type, host, message, raw: evt };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}
