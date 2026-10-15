import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { ServiceUrlsComponent } from './service-urls.component';
import { ScansApi } from '../data/scans.api';
import type { Scanner, Service, ServiceUrl } from '@core/models';

function url(id: string, scanner: Scanner, path: string, overrides: Partial<ServiceUrl> = {}): ServiceUrl {
  return {
    id,
    scanner,
    method: 'GET',
    url: `https://api.contoso.com${path}`,
    resource_type: scanner === 'tracer' ? 'probe' : 'xhr',
    status_code: 200,
    failure_reason: null,
    auth_method: 'unauthenticated',
    sent_auth_scheme: null,
    auth_challenge: null,
    redirect_url: null,
    page_url: 'https://app.intranet.contoso.com/dashboard',
    sources: [],
    ...overrides
  };
}

// The server's (url, method) order; the NTLM challenge is the merge's winner.
const health = url('u1', 'tracer', '/health');
const orders = url('u2', 'interceptor', '/orders?token=s3cr3t-value');
const users = url('u3', 'interceptor', '/users', {
  status_code: 401,
  auth_method: 'ntlm',
  auth_challenge: 'NTLM'
});
const ws = url('u4', 'interceptor', '/ws', {
  status_code: 0,
  failure_reason: 'net::ERR_CONNECTION_TIMED_OUT',
  auth_method: 'no_response'
});
const URLS = [health, orders, users, ws];

const service: Service = {
  id: 'svc_1',
  scheme: 'https',
  host: 'api.contoso.com',
  port: 443,
  auth_method: 'ntlm',
  severity: 'blocker',
  request_count: URLS.length,
  evidence: users,
  found_by: ['interceptor', 'tracer'],
  findings: [],
  sources: [],
  excluded: false,
  published_origin: null
};

async function setup(opts: { services?: Service[]; urls?: ServiceUrl[] | Error } = {}) {
  const urls = opts.urls ?? URLS;
  const apiStub: Partial<ScansApi> = {
    getFindings: vi.fn().mockResolvedValue(opts.services ?? [service]),
    listServiceUrls:
      urls instanceof Error ? vi.fn().mockRejectedValue(urls) : vi.fn().mockResolvedValue(urls)
  };
  const view = await render(ServiceUrlsComponent, {
    inputs: { id: 'scn_1', serviceId: 'svc_1' },
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      { provide: ScansApi, useValue: apiStub }
    ]
  });
  return { view, apiStub };
}

const bodyRows = () => screen.getAllByRole('row').slice(1);

describe('ServiceUrlsComponent', () => {
  it('heads the page with the service and lists every url, the verdict first', async () => {
    await setup();
    await screen.findByRole('heading', { name: 'https://api.contoso.com' });
    await screen.findByText('GET /users');

    const rows = bodyRows();
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText('GET /users')).toBeInTheDocument();
    expect(within(rows[0]).getByText('verdict')).toBeInTheDocument();
    // The rest keep the server's order.
    expect(rows.slice(1).map((r) => within(r).getByRole('button').textContent?.trim())).toEqual([
      'GET /health',
      'GET /orders',
      'GET /ws'
    ]);
  });

  it('shows the browser\'s error for a request that got no response', async () => {
    await setup();
    const row = (await screen.findByText('GET /ws')).closest('tr')!;
    expect(within(row).getByText('net::ERR_CONNECTION_TIMED_OUT')).toBeInTheDocument();
  });

  it('filters by scanner, counting each filter over all the urls', async () => {
    await setup();
    await screen.findByText('GET /users');

    fireEvent.click(screen.getByRole('button', { name: /probe \(1\)/i }));
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('GET /health')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /browser \(3\)/i }));
    expect(bodyRows()).toHaveLength(3);
    expect(screen.queryByText('GET /health')).not.toBeInTheDocument();
  });

  it('keeps the query out of the row and redacts it in the expanded detail', async () => {
    await setup();
    const toggle = await screen.findByRole('button', { name: 'GET /orders' });
    expect(screen.queryByText(/s3cr3t/)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Captured from the browser · xhr')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('s3cr3t');
  });

  it('shows the reconstructed challenge when the verdict row is expanded', async () => {
    await setup();
    fireEvent.click(await screen.findByRole('button', { name: 'GET /users' }));
    expect(screen.getByText('WWW-Authenticate: NTLM')).toBeInTheDocument();
    expect(screen.getByText(/Reconstructed/)).toBeInTheDocument();
  });

  it('says so when the scan has no such service', async () => {
    await setup({ services: [], urls: new Error('404') });
    expect(await screen.findByText('This scan has no such service.')).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load the service's URLs/)).not.toBeInTheDocument();
  });

  it('says so when the service has no urls', async () => {
    await setup({ urls: [] });
    expect(await screen.findByText('No URLs recorded for this service.')).toBeInTheDocument();
  });

  it('reports a failed url load for a service that exists', async () => {
    await setup({ urls: new Error('500') });
    await waitFor(() =>
      expect(screen.getByText("Failed to load the service's URLs.")).toBeInTheDocument()
    );
  });
});
