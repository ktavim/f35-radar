import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideAngularModule, X } from 'lucide-angular';
import { AuthPillComponent } from '@shared/components/auth-pill.component';
import { AuthMethodSelectComponent } from '@shared/components/auth-method-select.component';
import { ButtonComponent } from '@shared/ui/button.component';
import { redact } from '@lib/redact';
import { firstSeenOn, originLabel } from '@lib/service';
import { isUnresolvedAuthMethod } from '@lib/verdict';
import type { AuthMethod, Service, ServiceUrl } from '@core/models';

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
                  The scan couldn't classify this — set it manually to update the verdict.
                </p>
              </div>
            }
          </div>
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
            <p class="text-sm tabular-nums">{{ f.request_count }}</p>
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
  readonly isUnresolved = isUnresolvedAuthMethod;

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

  /**
   * Where the request came from, in the reviewer's terms rather than the
   * scanner's name: the interceptor records requests the page's browser made,
   * the tracer sends probes of its own. The difference matters because a probe
   * never carries the page's credentials, so its status says less about the app.
   */
  provenanceLabel(ev: ServiceUrl): string {
    return ev.scanner === 'interceptor' ? 'Captured from the browser' : 'Sent as a probe';
  }

  /**
   * The request's auth header as far as the scanner recorded it. The scanner
   * keeps the scheme word and drops the credential after it at capture, so the
   * stars stand for a value that was sent but never stored. Null when the
   * request carried no Authorization header, as the tracer's probes never do.
   */
  requestHeaders(ev: ServiceUrl): string | null {
    return ev.sent_auth_scheme ? `Authorization: ${ev.sent_auth_scheme} *****` : null;
  }

  /**
   * The response headers the scanner recorded: the challenge, and a redirect's
   * target with its query, fragment and userinfo already stripped. Null when
   * the response carried neither.
   */
  responseHeaders(ev: ServiceUrl): string | null {
    const lines: string[] = [];
    if (ev.auth_challenge) lines.push(`WWW-Authenticate: ${ev.auth_challenge}`);
    if (ev.redirect_url) lines.push(`Location: ${ev.redirect_url}`);
    return lines.length ? redact(lines.join('\n')) : null;
  }
}
