import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReviewPanelComponent } from './review-panel.component';
import { AuthService } from '@core/services/auth.service';
import { ShortcutsService } from '@core/shortcuts/shortcuts.service';
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
    scanners_auth_method: auth_method,
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
const negotiate = (id: string, host: string) => svc(id, host, 'negotiate', 'review');
// A negotiate a person named as NTLM: a bandit now, the scanners' verdict kept.
const correctedToNtlm = (id: string, host: string): Service => ({
  ...svc(id, host, 'ntlm', 'blocker'),
  scanners_auth_method: 'negotiate'
});
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
      provideTanStackQuery(new QueryClient()),
      { provide: AuthService, useValue: { currentUser: signal(null) } }
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
    expect(screen.getByRole('tab', { name: /leakers \(1\)/i })).toBeInTheDocument();
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
  it('disables the Include checkboxes and Submit', async () => {
    // Use `review` severity so the section opens by default and would normally
    // show enabled checkboxes — proving the frozen flag actually locks them.
    await setup([review('r1', 'a.contoso.com'), review('r2', 'b.contoso.com')], {
      isFrozen: true
    });
    const submit = screen.getByRole('button', { name: /submit scan/i });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText(/only the latest completed scan can be edited/i)
    ).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox', { name: /^include /i });
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).toBeDisabled();
  });

  it('enables the Include checkboxes when the scan is not frozen', async () => {
    // Sanity check: with the same fixtures but isFrozen=false the checkbox is editable.
    await setup([review('r1', 'a.contoso.com')], { isFrozen: false });
    const box = screen.getByRole('checkbox', { name: /^include /i });
    expect(box).toBeEnabled();
    expect(box).toBeChecked();
  });
});

describe('ReviewPanelComponent — tabs', () => {
  it('opens on Bandits when there are any, even all excluded', async () => {
    await setup([blocker('b1', 'auth.contoso.com', true), review('r1', 'a.contoso.com')]);
    expect(screen.getByRole('tab', { name: /bandits/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on Bogeys when there are no bandits', async () => {
    await setup([review('r1', 'a.contoso.com'), cleared('c1', 'cdn.contoso.com')]);
    expect(screen.getByRole('tab', { name: /bogeys/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on All when nothing needs a decision', async () => {
    await setup([cleared('c1', 'cdn.contoso.com'), published('p1', 'legacy.contoso.com')]);
    expect(screen.getByRole('tab', { name: /all \(2\)/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('lists every group on the All tab, Friendlies collapsed', async () => {
    await setup([blocker('b1', 'auth.contoso.com'), cleared('c1', 'cdn.contoso.com')]);
    fireEvent.click(screen.getByRole('tab', { name: /all/i }));
    expect(await screen.findByText('https://auth.contoso.com')).toBeInTheDocument();
    expect(screen.queryByText('https://cdn.contoso.com')).toBeNull();
  });

  it('shows only the chosen group, expanded, on its own tab', async () => {
    await setup([blocker('b1', 'auth.contoso.com'), cleared('c1', 'cdn.contoso.com')]);
    fireEvent.click(screen.getByRole('tab', { name: /friendlies/i }));
    expect(await screen.findByText('https://cdn.contoso.com')).toBeInTheDocument();
    expect(screen.queryByText('https://auth.contoso.com')).toBeNull();
  });

  it('moves between tabs with the arrow keys', async () => {
    await setup([blocker('b1', 'auth.contoso.com')]);
    fireEvent.keyDown(screen.getByRole('tab', { name: /bandits/i }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /bogeys/i })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('ReviewPanelComponent — keyboard cursor', () => {
  it('never toggles a finding in a collapsed group', async () => {
    const { fixture } = await setup([blocker('b1', 'auth.contoso.com'), cleared('c1', 'cdn.contoso.com')]);
    const panel = fixture.componentInstance;
    const toggled: string[] = [];
    panel.onToggle = (f) => void toggled.push(f.id);

    // On All, only the Bandits row is on screen, so j cannot walk into the collapsed Friendlies.
    fireEvent.click(screen.getByRole('tab', { name: /all/i }));
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'x' });
    expect(toggled).toEqual(['b1']);
  });

  it('acts on the active tab’s rows', async () => {
    const { fixture } = await setup([blocker('b1', 'auth.contoso.com'), cleared('c1', 'cdn.contoso.com')]);
    const panel = fixture.componentInstance;
    const toggled: string[] = [];
    panel.onToggle = (f) => void toggled.push(f.id);

    fireEvent.click(screen.getByRole('tab', { name: /friendlies/i }));
    fireEvent.keyDown(window, { key: 'x' });
    expect(toggled).toEqual(['c1']);
  });

  it('ignores the shortcut key when Ctrl is held', async () => {
    const { fixture } = await setup([blocker('b1', 'auth.contoso.com')]);
    const panel = fixture.componentInstance;
    const toggled: string[] = [];
    panel.onToggle = (f) => void toggled.push(f.id);

    fireEvent.keyDown(window, { key: 'x', ctrlKey: true });
    expect(toggled).toEqual([]);
  });

  it('follows a binding changed in Settings', async () => {
    localStorage.clear();
    const { fixture } = await setup([blocker('b1', 'auth.contoso.com')]);
    const panel = fixture.componentInstance;
    const toggled: string[] = [];
    panel.onToggle = (f) => void toggled.push(f.id);

    TestBed.inject(ShortcutsService).setBinding('review.toggleExclusion', 'Alt+e');
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'e', altKey: true });
    expect(toggled).toEqual(['b1']);
    localStorage.clear();
  });
});

describe('ReviewPanelComponent — manual auth correction', () => {
  it('offers only Kerberos and NTLM for a negotiate', async () => {
    await setup([negotiate('n1', 'sso.contoso.com')]);
    fireEvent.click(screen.getByText(/sso\.contoso\.com/));
    fireEvent.click(screen.getByRole('button', { name: /set auth method/i }));
    expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual(['KERBEROS', 'NTLM']);
  });

  it('marks a corrected service as manual and undoes it back to the scanners’ verdict', async () => {
    const { fixture } = await setup([correctedToNtlm('n1', 'sso.contoso.com')]);
    const panel = fixture.componentInstance;
    const set: string[] = [];
    panel.onSetAuthMethod = (e) => void set.push(e.method);

    expect(screen.getByText('manual')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/sso\.contoso\.com/));
    expect(screen.getByText(/the scanners found NEGOTIATE/)).toBeInTheDocument();
    // Still editable after the correction: it can be changed again, or undone.
    expect(screen.getByRole('button', { name: /change auth method/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(set).toEqual(['negotiate']);
  });

  it('keeps the marker but offers no edits on a frozen scan', async () => {
    await setup([correctedToNtlm('n1', 'sso.contoso.com')], { isFrozen: true });
    fireEvent.click(screen.getByText(/sso\.contoso\.com/));
    expect(screen.getAllByText('manual').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /auth method/i })).toBeNull();
  });

  it('offers no edits for a method the scanners detected', async () => {
    await setup([blocker('b1', 'auth.contoso.com')]);
    fireEvent.click(screen.getByText(/auth\.contoso\.com/));
    expect(screen.queryByRole('button', { name: /auth method/i })).toBeNull();
  });
});
