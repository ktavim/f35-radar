import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-angular';
import { AuthPillComponent } from '@shared/components/auth-pill.component';
import { SkeletonComponent } from '@shared/components/skeleton.component';
import { redact } from '@lib/redact';
import {
  originLabel,
  provenanceLabel,
  requestHeaders,
  requestPath,
  responseHeaders,
  responseStatus,
  scannerLabel
} from '@lib/service';
import { useFindingsQuery, useServiceUrlsQuery } from '../data/scans.queries';
import type { Scanner, ServiceUrl } from '@core/models';

type Filter = 'all' | Scanner;

const FILTERS: Filter[] = ['all', 'interceptor', 'tracer'];

/**
 * Every url behind one service, from both scanners: the requests the browser
 * made and the probes the tracer sent. The drawer shows only the request that
 * decided the verdict; this page shows the rest, so a reviewer can see whether
 * any endpoint on the origin answered differently.
 */
@Component({
  selector: 'app-service-urls',
  standalone: true,
  imports: [RouterLink, LucideAngularModule, AuthPillComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Preserves ?tab= so the scan opens on the tab the user came from. -->
    <a
      class="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg mb-3"
      [routerLink]="['/scans', id()]"
      queryParamsHandling="preserve">
      <lucide-icon [name]="icons.ArrowLeft" [size]="12"></lucide-icon>
      Back to scan
    </a>

    @if (findingsQuery.isLoading()) {
      <app-skeleton height="32px" width="400px"></app-skeleton>
    } @else if (findingsQuery.isError()) {
      <div class="text-sm text-danger">Failed to load the service.</div>
    } @else if (service(); as s) {
      <header class="mb-4">
        <h1 class="text-xl font-semibold text-fg font-mono truncate">{{ originLabel(s) }}</h1>
        <div class="flex items-center gap-3 mt-1">
          <app-auth-pill [method]="s.auth_method"></app-auth-pill>
          <span class="text-xs text-fg-muted tabular-nums">
            {{ s.request_count }} {{ s.request_count === 1 ? 'URL' : 'URLs' }}
          </span>
          @if (s.excluded) {
            <span class="text-xs text-fg-subtle italic">excluded</span>
          }
        </div>
      </header>
    } @else {
      <div class="text-sm text-fg-muted">This scan has no such service.</div>
    }

    @if (urlsQuery.isLoading()) {
      <app-skeleton height="200px"></app-skeleton>
    } @else if (urlsQuery.isError()) {
      @if (service()) {
        <div class="text-sm text-danger">Failed to load the service's URLs.</div>
      }
    } @else {
      <div class="flex items-center gap-1 mb-3" role="group" aria-label="Filter by scanner">
        @for (f of filters(); track f.key) {
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 h-7 rounded-md text-xs border"
            [class.border-border-strong]="filter() === f.key"
            [class.bg-surface-2]="filter() === f.key"
            [class.text-fg]="filter() === f.key"
            [class.font-medium]="filter() === f.key"
            [class.border-transparent]="filter() !== f.key"
            [class.text-fg-muted]="filter() !== f.key"
            [attr.aria-pressed]="filter() === f.key"
            (click)="filter.set(f.key)">
            <span>{{ f.label }}</span>
            <span class="tabular-nums">({{ f.count }})</span>
          </button>
        }
      </div>

      @if (shownUrls().length === 0) {
        <div class="border border-border rounded-md bg-surface px-4 py-3 text-xs text-fg-muted">
          {{ emptyMessage() }}
        </div>
      } @else {
        <div class="border border-border rounded-md bg-surface">
          <table class="w-full text-sm">
            <thead class="bg-surface-2">
              <tr>
                <th class="text-left px-4 h-8 text-xs uppercase tracking-wide font-medium text-fg-muted">Request</th>
                <th class="text-left px-4 h-8 text-xs uppercase tracking-wide font-medium text-fg-muted">Status</th>
                <th class="text-left px-4 h-8 text-xs uppercase tracking-wide font-medium text-fg-muted">Auth</th>
                <th class="text-left px-4 h-8 text-xs uppercase tracking-wide font-medium text-fg-muted">Seen by</th>
                <th class="text-left px-4 h-8 text-xs uppercase tracking-wide font-medium text-fg-muted">Page</th>
              </tr>
            </thead>
            <tbody>
              @for (u of shownUrls(); track u.id) {
                <tr
                  class="border-t border-border hover:bg-surface-2 cursor-pointer"
                  [style.border-left]="u.id === evidenceId() ? '2px solid var(--color-accent)' : '2px solid transparent'"
                  (click)="toggle(u.id)">
                  <td class="px-4 h-10 font-mono text-xs text-fg">
                    <div class="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1.5 min-w-0 text-left"
                        [attr.aria-expanded]="isOpen(u.id)"
                        [attr.aria-controls]="'url-detail-' + u.id"
                        [attr.title]="requestTitle(u)"
                        (click)="$event.stopPropagation(); toggle(u.id)">
                        <lucide-icon
                          class="shrink-0"
                          [name]="isOpen(u.id) ? icons.ChevronDown : icons.ChevronRight"
                          [size]="12">
                        </lucide-icon>
                        <span class="truncate max-w-[420px]">{{ u.method }} {{ requestPath(u.url) }}</span>
                      </button>
                      @if (u.id === evidenceId()) {
                        <span
                          class="shrink-0 px-1.5 py-0.5 rounded-sm text-[10px] uppercase tracking-wide font-sans border border-accent/30 bg-accent/15 text-accent"
                          title="The request whose classification decided the service's verdict">
                          verdict
                        </span>
                      }
                    </div>
                  </td>
                  <td class="px-4 h-10 font-mono text-xs" [class.text-fg-muted]="u.status_code === 0">
                    {{ responseStatus(u) }}
                  </td>
                  <td class="px-4 h-10">
                    <app-auth-pill [method]="u.auth_method"></app-auth-pill>
                  </td>
                  <td class="px-4 h-10 text-xs text-fg-muted">{{ scannerLabel(u.scanner) }}</td>
                  <td
                    class="px-4 h-10 text-xs text-fg-muted font-mono truncate max-w-[220px]"
                    [attr.title]="redacted(u.page_url)">
                    {{ requestPath(u.page_url) }}
                  </td>
                </tr>
                @if (isOpen(u.id)) {
                  <tr [id]="'url-detail-' + u.id" class="border-t border-border bg-bg">
                    <td colspan="5" class="px-4 py-3">
                      <dl class="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-xs">
                        <dt class="text-fg-muted">URL</dt>
                        <dd class="font-mono text-fg break-all">{{ u.method }} {{ redacted(u.url) }}</dd>
                        <dt class="text-fg-muted">Provenance</dt>
                        <dd>{{ provenanceLabel(u) }} · {{ u.resource_type }}</dd>
                        <dt class="text-fg-muted">Page</dt>
                        <dd class="font-mono break-all">{{ redacted(u.page_url) }}</dd>
                        @if (u.sources.length) {
                          <dt class="text-fg-muted">Found in</dt>
                          <dd>
                            <ul class="space-y-0.5">
                              @for (source of u.sources; track source) {
                                <li class="font-mono break-all">{{ redacted(source) }}</li>
                              }
                            </ul>
                          </dd>
                        }
                        @if (requestHeaders(u); as headers) {
                          <dt class="text-fg-muted">Request headers</dt>
                          <dd><pre class="font-mono whitespace-pre-wrap break-all">{{ headers }}</pre></dd>
                        }
                        @if (responseHeaders(u); as headers) {
                          <dt class="text-fg-muted">Response headers</dt>
                          <dd><pre class="font-mono whitespace-pre-wrap break-all">{{ headers }}</pre></dd>
                        }
                      </dl>
                      @if (requestHeaders(u) || responseHeaders(u)) {
                        <p class="text-[11px] text-fg-subtle mt-2">Reconstructed: Full headers are not stored.</p>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    }
  `
})
export class ServiceUrlsComponent {
  readonly icons = { ArrowLeft, ChevronDown, ChevronRight };
  readonly originLabel = originLabel;
  readonly requestPath = requestPath;
  readonly responseStatus = responseStatus;
  readonly scannerLabel = scannerLabel;
  readonly provenanceLabel = provenanceLabel;
  readonly requestHeaders = requestHeaders;
  readonly responseHeaders = responseHeaders;

  // Bound from route via withComponentInputBinding().
  readonly id = input.required<string>();
  readonly serviceId = input.required<string>();

  // There is no endpoint for one service, so the header reads it out of the
  // scan's services, which the review screen has usually cached already.
  readonly findingsQuery = useFindingsQuery(() => this.id());
  readonly urlsQuery = useServiceUrlsQuery(() => this.id(), () => this.serviceId());

  readonly service = computed(
    () => this.findingsQuery.data()?.find((s) => s.id === this.serviceId()) ?? null
  );
  readonly evidenceId = computed(() => this.service()?.evidence?.id ?? null);

  readonly filter = signal<Filter>('all');
  private readonly openIds = signal<ReadonlySet<string>>(new Set());

  // Fetched once and filtered here rather than through ?scanner=: tens of rows,
  // and the counts on every filter need all of them anyway.
  private readonly urls = computed(() => this.urlsQuery.data() ?? []);

  readonly filters = computed(() =>
    FILTERS.map((key) => ({
      key,
      label: key === 'all' ? 'All' : scannerLabel(key),
      count: key === 'all' ? this.urls().length : this.urls().filter((u) => u.scanner === key).length
    }))
  );

  // The server sorts by (url, method). The request that decided the verdict is
  // lifted to the top, since it is the one a reviewer reads first.
  readonly shownUrls = computed(() => {
    const f = this.filter();
    const rows = f === 'all' ? this.urls() : this.urls().filter((u) => u.scanner === f);
    const evidence = rows.find((u) => u.id === this.evidenceId());
    return evidence ? [evidence, ...rows.filter((u) => u !== evidence)] : rows;
  });

  readonly emptyMessage = computed(() => {
    const f = this.filter();
    return f === 'all'
      ? 'No URLs recorded for this service.'
      : `No ${scannerLabel(f).toLowerCase()} URLs for this service.`;
  });

  isOpen(id: string): boolean {
    return this.openIds().has(id);
  }

  toggle(id: string) {
    this.openIds.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** The whole request for the cell's tooltip, redacted again client-side like the detail panel does. */
  requestTitle(u: ServiceUrl): string {
    return `${u.method} ${redact(u.url)}`;
  }

  // The server is authoritative on redaction, but anything that could carry a
  // token is redacted again here so a misconfigured backend can't leak one.
  redacted(value: string): string {
    return redact(value);
  }
}
