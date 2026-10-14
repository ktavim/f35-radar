import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideAngularModule, X } from 'lucide-angular';
import { AuthPillComponent } from '@shared/components/auth-pill.component';
import { AuthMethodSelectComponent } from '@shared/components/auth-method-select.component';
import { ButtonComponent } from '@shared/ui/button.component';
import { redact } from '@lib/redact';
import { firstSeenOn, originLabel } from '@lib/service';
import { isUnresolvedAuthMethod } from '@lib/verdict';
import type { AuthMethod, Service, ServiceUrl } from '@core/models';

interface EvidenceRow {
  label: string;
  value: string;
}

@Component({
  selector: 'app-finding-detail-panel',
  standalone: true,
  imports: [LucideAngularModule, AuthPillComponent, AuthMethodSelectComponent, ButtonComponent],
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
              <app-auth-pill [method]="f.auth_method"></app-auth-pill>
            </div>
            @if (isUnresolved(f.auth_method) && !readonly()) {
              <div class="mt-2 space-y-1">
                <app-auth-method-select
                  (methodSelected)="setAuthMethod.emit({ finding: f, method: $event })">
                </app-auth-method-select>
                <p class="text-[11px] text-fg-subtle">
                  The scanners couldn't classify this — set it manually to update the verdict.
                </p>
              </div>
            }
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">First seen on page</p>
            <p class="text-sm font-mono text-fg break-all">{{ firstSeenOn(f) ?? '—' }}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">Request count</p>
            <p class="text-sm tabular-nums">{{ f.request_count }}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-fg-muted mb-1">Evidence</p>
            @if (f.evidence; as ev) {
              <dl class="bg-bg border border-border rounded-md p-3 space-y-2">
                @for (row of evidenceRows(ev); track row.label) {
                  <div>
                    <dt class="text-[11px] text-fg-subtle">{{ row.label }}</dt>
                    <dd class="text-xs font-mono text-fg whitespace-pre-wrap break-all">{{ row.value }}</dd>
                  </div>
                }
              </dl>
            } @else {
              <p class="text-xs text-fg-subtle italic">No request evidence recorded for this service.</p>
            }
          </div>
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
  readonly isUnresolved = isUnresolvedAuthMethod;

  readonly finding = input<Service | null>(null);
  readonly readonly = input<boolean>(false);
  readonly closePanel = output<void>();
  readonly toggleExclude = output<Service>();
  readonly setAuthMethod = output<{ finding: Service; method: AuthMethod }>();

  /**
   * The winning request as label/value rows. The server is authoritative on
   * redaction, but anything that could carry a token is redacted again here.
   */
  evidenceRows(ev: ServiceUrl): EvidenceRow[] {
    const rows: EvidenceRow[] = [
      { label: 'Request', value: `${ev.method} ${redact(ev.url)}` },
      {
        label: 'Status',
        value:
          ev.status_code === 0
            ? `no response${ev.failure_reason ? ` · ${ev.failure_reason}` : ''}`
            : String(ev.status_code)
      }
    ];
    if (ev.auth_challenge) rows.push({ label: 'WWW-Authenticate', value: redact(ev.auth_challenge) });
    if (ev.sent_auth_scheme) rows.push({ label: 'Sent auth scheme', value: ev.sent_auth_scheme });
    if (ev.redirect_url) rows.push({ label: 'Redirected to', value: redact(ev.redirect_url) });
    rows.push({ label: 'Seen by', value: ev.scanner });
    return rows;
  }
}
