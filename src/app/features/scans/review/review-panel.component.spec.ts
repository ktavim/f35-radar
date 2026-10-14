import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { ReviewPanelComponent } from './review-panel.component';
import type { AuthMethod, Service, Severity } from '@core/models';

// The smallest service the panel accepts: found by the interceptor alone, with
// no request evidence, so only the verdict is under test.
function svc(id: string, host: string, auth_method: AuthMethod, severity: Severity, excluded = false): Service {
  return {
    id,
    scheme: 'https',
    host,
    port: 443,
    auth_method,
    severity,
    request_count: 1,
    evidence: null,
    found_by: ['interceptor'],
    findings: [{ scanner: 'interceptor', auth_method, severity, evidence: null }],
    sources: [],
    excluded,
    published_origin: null
  };
}

const cleared = (id: string, host: string) => svc(id, host, 'oauth', 'cleared');
const review = (id: string, host: string) => svc(id, host, 'unknown', 'review');
const blocker = (id: string, host: string, excluded = false) => svc(id, host, 'ntlm', 'blocker', excluded);
// NTLM, yet published: the registry's verdict outranks the method.
const published = (id: string, host: string): Service => ({
  ...svc(id, host, 'ntlm', 'published'),
  published_origin: {
    id: 'pub_1',
    scheme: 'https',
    host,
    port: 443,
    note: 'Published through the legacy iRule.',
    added_by: 'f5-admin',
    added_at: '2026-01-01T00:00:00Z'
  }
});

interface SetupOpts {
  isLatestScan?: boolean;
  isFrozen?: boolean;
  isCompleted?: boolean;
}

function setup(findings: Service[], opts: SetupOpts = {}) {
  return render(ReviewPanelComponent, {
    inputs: {
      scanId: 'scn_test',
      findings,
      isLatestScan: opts.isLatestScan ?? true,
      isFrozen: opts.isFrozen ?? false,
      isCompleted: opts.isCompleted ?? true
    },
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideTanStackQuery(new QueryClient())
    ]
  });
}

// Acceptance test #4:
//   "Submit is enabled by default when there are no blockers."
describe('ReviewPanelComponent — no blockers', () => {
  it('enables Submit by default since findings are included by default', async () => {
    await setup([cleared('f1', 'a.contoso.com'), cleared('f2', 'b.contoso.com')]);
    const submit = screen.getByRole('button', { name: /submit scan/i });
    expect(submit).not.toBeDisabled();
  });
});

// Acceptance test #5:
//   "With blockers, Submit is disabled until every blocker is excluded."
describe('ReviewPanelComponent — blockers present', () => {
  it('disables Submit while any blocker is unexcluded', async () => {
    await setup([blocker('b1', 'auth.contoso.com'), cleared('c1', 'cdn.contoso.com')]);
    const submit = screen.getByRole('button', { name: /submit scan/i });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText(/bandit must be excluded or remediated before submitting/i)
    ).toBeInTheDocument();
  });
});

describe('ReviewPanelComponent — published services', () => {
  it('lists a published service in its own group and does not count it as a blocker', async () => {
    await setup([published('p1', 'legacy.contoso.com'), cleared('c1', 'cdn.contoso.com')]);
    expect(screen.getByText('Leakers')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /submit scan/i });
    expect(submit).not.toBeDisabled();
  });
});

describe('ReviewPanelComponent — non-latest scan', () => {
  it('disables Submit and explains why when the scan is not the latest', async () => {
    await setup([cleared('f1', 'a.contoso.com')], { isLatestScan: false });
    const submit = screen.getByRole('button', { name: /submit scan/i });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText(/only the latest completed scan can be submitted/i)
    ).toBeInTheDocument();
  });
});

describe('ReviewPanelComponent — non-completed scan', () => {
  it('disables Submit and explains why when the scan is not completed', async () => {
    await setup([cleared('f1', 'a.contoso.com')], { isCompleted: false });
    const submit = screen.getByRole('button', { name: /submit scan/i });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/only completed scans can be submitted/i)).toBeInTheDocument();
  });
});

describe('ReviewPanelComponent — frozen scan', () => {
  it('hides the exclusion toggle buttons and disables Submit', async () => {
    // Use `review` severity so the section opens by default and would normally
    // show Exclude buttons — proving the frozen flag actually suppresses them.
    await setup([review('r1', 'a.contoso.com'), review('r2', 'b.contoso.com')], {
      isFrozen: true
    });
    const submit = screen.getByRole('button', { name: /submit scan/i });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText(/only the latest completed scan can be edited/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^exclude$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^re-include$/i })).toBeNull();
  });

  it('shows Exclude buttons normally when the scan is not frozen', async () => {
    // Sanity check: with the same fixtures but isFrozen=false the buttons appear.
    await setup([review('r1', 'a.contoso.com')], { isFrozen: false });
    expect(screen.getByRole('button', { name: /^exclude$/i })).toBeInTheDocument();
  });
});
