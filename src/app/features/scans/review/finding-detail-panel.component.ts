import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, X } from 'lucide-angular';
import { AuthPillComponent } from '@shared/components/auth-pill.component';
import { AuthMethodSelectComponent } from '@shared/components/auth-method-select.component';
import { ButtonComponent } from '@shared/ui/button.component';
import { redact } from '@lib/redact';
import {
  firstSeenOn,
  originLabel,
  provenanceLabel,
  requestHeaders,
  responseHeaders
} from '@lib/service';
import { authMethodLabel, correctableReason, correctedFrom, manualAuthTargets } from '@lib/verdict';
import type { AuthMethod, Service } from '@core/models';

@Component({
  selector: 'app-finding-detail-panel',
  standalone: true,
  imports: [RouterLink, LucideAngularModule, AuthPillComponent, AuthMethodSelectComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (finding(); as f) {
      <aside
        class="fixed top-0 right-0 bottom-0 w-[480px] bg-surface border-l border-border shadow-2xl z-40 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finding-detail-title">
        <header class="h-12 px-4 border-b border-border flex items-center justify-between">
          <h2 id="finding-detail-title" class="text-sm font-medium font-mono truncate">{{ originLabel(f) }}</h2>
          <button
            type="button"
            class="w-7 h-7 inline-flex items-center justify-center rounded hover:bg-surface-2"
            (click)="closePanel.emit()"
            aria-label="Close">
            <lucide-icon [name]="icons.X" [size]="14"></lucide-icon>
          </button>
        </header>
        <div class="flex-1 overflow-y-auto thin-scroll p-4 space-y-4">
          <div>
            <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">Auth method</p>
            <div class="flex items-center gap-2">
              <app-auth-pill [method]="f.auth_method" [correctedFrom]="correctedFrom(f)"></app-auth-pill>
            </div>
            @if (correctedFrom(f); as from) {
              <p class="text-[11px] text-fg-subtle mt-1">
                Set manually; the scanners found {{ authMethodLabel(from) }}.
              </p>
            }
            @if (correctableReason(f.scanners_auth_method ?? f.auth_method); as reason) {
              <!-- Why the scanners left the method to a person: the pill reads
                   UNKNOWN or NEGOTIATE, or did before the correction. Comes
                   from the verdict, not the evidence, so it shows on a locked
                   scan and on a service that kept no request. -->
              <p class="text-[11px] text-fg-subtle mt-1">{{ reason }}</p>
            }
            @if (!readonly()) {
              @if (manualAuthTargets(f.scanners_auth_method); as targets) {
                <div class="mt-2 space-y-1">
                  <div class="flex items-center gap-2">
                    <app-auth-method-select
                      [methods]="targets"
                      [current]="f.auth_method"
                      [label]="correctedFrom(f) ? 'Change auth method…' : 'Set auth method…'"
                      (methodSelected)="setAuthMethod.emit({ finding: f, method: $event })">
                    </app-auth-method-select>
                    @if (correctedFrom(f); as from) {
                      <!-- Undo is setting the scanners' verdict back. -->
                      <app-button
                        variant="ghost"
                        size="sm"
                        (click)="setAuthMethod.emit({ finding: f, method: from })">
                        Undo
                      </app-button>
                    }
                  </div>
                  @if (!correctedFrom(f)) {
                    <p class="text-[11px] text-fg-subtle">Set it manually to update the verdict.</p>
                  }
                </div>
              }
            }
          </div>
          @if (f.ips?.length) {
            <!-- Nothing shown when the host didn't resolve: the dns_failed
                 reason above already says so. -->
            <div>
              <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">IPs</p>
              <ul class="space-y-1">
                @for (ip of f.ips; track ip) {
                  <li class="text-xs font-mono text-fg break-all">{{ ip }}</li>
                }
              </ul>
            </div>
          }
          @if (firstSeenOn(f); as page) {
            <div>
              <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">First seen on page</p>
              <p class="text-sm font-mono text-fg break-all">{{ page }}</p>
            </div>
          }
          @if (f.sources.length) {
            <div>
              <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">Sources</p>
              <ul class="space-y-1">
                @for (source of f.sources; track source.kind + ':' + source.value) {
                  <li class="flex items-baseline gap-2">
                    <span class="shrink-0 w-20 text-[11px] text-fg-subtle">{{ source.kind }}</span>
                    <span class="text-xs font-mono text-fg break-all">{{ redacted(source.value) }}</span>
                  </li>
                }
              </ul>
            </div>
          }
          <div>
            <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">URL count</p>
            <div class="flex items-baseline gap-3">
              <p class="text-sm tabular-nums">{{ f.request_count }}</p>
              @if (f.request_count > 0) {
                <!-- Preserves ?tab= so the page's back link returns to this tab. -->
                <a
                  class="text-xs text-accent hover:underline"
                  [routerLink]="['/scans', scanId(), 'services', f.id]"
                  queryParamsHandling="preserve">
                  View all URLs →
                </a>
              }
            </div>
          </div>
          @if (f.evidence; as ev) {
            <div>
              <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">Request</p>
              <p class="text-xs font-mono text-fg break-all">{{ ev.method }} {{ redacted(ev.url) }}</p>
              <p class="text-[11px] text-fg-subtle mt-0.5">{{ provenanceLabel(ev) }}</p>
            </div>
            @if (ev.status_code === 0) {
              <div>
                <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">Error</p>
                <p class="text-sm font-mono">{{ ev.failure_reason || 'no response recorded' }}</p>
              </div>
            } @else {
              <div>
                <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">Status code</p>
                <p class="text-sm font-mono">{{ ev.status_code }}</p>
              </div>
            }
            @if (requestHeaders(ev); as headers) {
              <div>
                <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">Request headers</p>
                <pre class="bg-bg border border-border rounded-md p-3 text-xs font-mono whitespace-pre-wrap break-all">{{ headers }}</pre>
              </div>
            }
            @if (responseHeaders(ev); as headers) {
              <div>
                <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">Response headers</p>
                <pre class="bg-bg border border-border rounded-md p-3 text-xs font-mono whitespace-pre-wrap break-all">{{ headers }}</pre>
              </div>
            }
            @if (requestHeaders(ev) || responseHeaders(ev)) {
              <p class="text-[11px] text-fg-subtle">
                Reconstructed: Full headers are not stored.
              </p>
            }
          } @else {
            <div>
              <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">Evidence</p>
              <p class="text-xs text-fg-subtle italic">No request evidence recorded for this service.</p>
            </div>
          }
        </div>
        <footer class="h-14 px-4 border-t border-border flex items-center justify-end gap-2">
          @if (readonly()) {
            <span class="text-xs text-fg-subtle italic">
              {{ f.excluded ? 'excluded' : 'included' }} — this scan is locked
            </span>
          } @else if (f.excluded) {
            <app-button variant="ghost" size="md" (click)="toggleExclude.emit(f)">
              Re-include
            </app-button>
          } @else {
            <app-button
              variant="secondary"
              size="md"
              (click)="toggleExclude.emit(f)">
              Exclude
            </app-button>
          }
        </footer>
      </aside>
    }
  `
})
export class FindingDetailPanelComponent {
  readonly icons = { X };
  readonly originLabel = originLabel;
  readonly firstSeenOn = firstSeenOn;
  readonly authMethodLabel = authMethodLabel;
  readonly correctableReason = correctableReason;
  readonly correctedFrom = correctedFrom;
  readonly manualAuthTargets = manualAuthTargets;
  readonly provenanceLabel = provenanceLabel;
  readonly requestHeaders = requestHeaders;
  readonly responseHeaders = responseHeaders;

  readonly scanId = input.required<string>();
  readonly finding = input<Service | null>(null);
  readonly readonly = input<boolean>(false);
  readonly closePanel = output<void>();
  readonly toggleExclude = output<Service>();
  readonly setAuthMethod = output<{ finding: Service; method: AuthMethod }>();

  // The server is authoritative on redaction, but anything that could carry a
  // token is redacted again here so a misconfigured backend can't leak one.
  redacted(value: string): string {
    return redact(value);
  }
}
