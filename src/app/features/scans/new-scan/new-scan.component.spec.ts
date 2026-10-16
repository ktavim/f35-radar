import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { NewScanComponent } from './new-scan.component';
import { ScansApi } from '../data/scans.api';

// Acceptance test #1:
//   "Submitting the New Scan form without picking an app shows an inline error
//    and does not call the API." The scan now targets the app's own URL, so the
//    form no longer collects a URL — the app selection is the required input.
describe('NewScanComponent', () => {
  it('blocks submit and shows an inline error when no app is picked', async () => {
    const createScan = vi.fn();
    const apiStub: Partial<ScansApi> = {
      listScans: vi.fn().mockResolvedValue([]),
      listApps: vi.fn().mockResolvedValue([]),
      createScan
    };

    const view = await render(NewScanComponent, {
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideTanStackQuery(new QueryClient()),
        { provide: ScansApi, useValue: apiStub }
      ]
    });
    const cmp = view.fixture.componentInstance;

    cmp.submit();
    view.detectChanges();

    expect(screen.getByText(/pick an app first/i)).toBeInTheDocument();
    expect(createScan).not.toHaveBeenCalled();
  });

  it('offers depths 1-3, defaults to 2, and submits the picked depth', async () => {
    const createScan = vi.fn().mockResolvedValue({ scan_id: 'scan-1' });
    const apiStub: Partial<ScansApi> = {
      listScans: vi.fn().mockResolvedValue([]),
      listApps: vi.fn().mockResolvedValue([]),
      createScan
    };

    const view = await render(NewScanComponent, {
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideTanStackQuery(new QueryClient()),
        { provide: ScansApi, useValue: apiStub }
      ]
    });

    const options = screen.getAllByRole('radio').map((r) => r.textContent?.trim());
    expect(options).toEqual(['1', '2', '3']);
    expect(screen.getByRole('radio', { name: '2' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: '3' }));
    expect(screen.getByRole('radio', { name: '3' })).toHaveAttribute('aria-checked', 'true');

    view.fixture.componentInstance.onAppPicked('app-1');
    view.fixture.componentInstance.submit();

    await waitFor(() => expect(createScan).toHaveBeenCalled());
    expect(createScan.mock.calls[0][0]).toEqual({ app_id: 'app-1', max_depth: 3 });
  });
});
