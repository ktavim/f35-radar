import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output
} from '@angular/core';
import { LucideAngularModule, ChevronDown, ChevronRight } from 'lucide-angular';
import { AuthPillComponent } from '@shared/components/auth-pill.component';
import { SeverityDotComponent } from '@shared/components/severity-dot.component';
import { ButtonComponent } from '@shared/ui/button.component';
import { redact } from '@lib/redact';
import { originLabel, requestPath } from '@lib/service';
import type { Service, ServiceUrl, Severity } from '@core/models';

@Component({
  selector: 'app-findings-section',
  standalone: true,
  imports: [LucideAngularModule, AuthPillComponent, SeverityDotComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="border border-border rounded-md bg-surface mb-3">
      @if (collapsible()) {
        <button
          type="button"
          class="w-full flex items-center justify-between px-4 h-10 hover:bg-surface-2"
          (click)="open.set(!open())"
          [attr.aria-expanded]="open()">
          <div class="flex items-center gap-2">
            <lucide-icon [name]="open() ? icons.ChevronDown : icons.ChevronRight" [size]="14"></lucide-icon>
            <app-severity-dot [severity]="severity()"></app-severity-dot>
            <span class="text-sm font-medium text-fg">{{ heading() }}</span>
            <span class="text-xs text-fg-muted tabular-nums">({{ findings().length }})</span>
          </div>
        </button>
      }

      @if (expanded() && findings().length > 0) {
        <div [class.border-t]="collapsible()" [class.border-border]="collapsible()">
          <table class="w-full text-sm">
            <thead class="bg-surface-2">
              <tr>
                <th class="text-left px-4 h-8 text-xs uppercase tracking-wide font-medium text-fg-muted">Origin</th>
                <th class="text-left px-4 h-8 text-xs uppercase tracking-wide font-medium text-fg-muted">Auth</th>
                <th class="text-left px-4 h-8 text-xs uppercase tracking-wide font-medium text-fg-muted">Request</th>
                <th class="text-right px-4 h-8 text-xs uppercase tracking-wide font-medium text-fg-muted">URLs</th>
                <th class="text-right px-4 h-8 text-xs uppercase tracking-wide font-medium text-fg-muted w-48">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (f of findings(); track f.id) {
                <tr
                  class="border-t border-border hover:bg-surface-2"
                  [class.cursor-pointer]="true"
                  [class.bg-surface-2]="f.id === highlightedId()"
                  [style.border-left]="f.id === highlightedId() ? '2px solid var(--color-accent)' : '2px solid transparent'"
                  (click)="selectFinding.emit(f)">
                  <!-- Excluded rows are dimmed cell by cell, not on the <tr>, so the Action cell keeps full opacity. -->
                  <td class="px-4 h-10 font-mono text-xs"
                      [class.opacity-60]="f.excluded"
                      [class.text-fg-muted]="f.excluded"
                      [class.line-through]="f.excluded"
                      [class.text-fg]="!f.excluded">
                    {{ originLabel(f) }}
                  </td>
                  <td class="px-4 h-10" [class.opacity-60]="f.excluded">
                    <app-auth-pill [method]="f.auth_method"></app-auth-pill>
                  </td>
                  <td class="px-4 h-10 text-xs text-fg-muted font-mono truncate max-w-[260px]"
                      [class.opacity-60]="f.excluded"
                      [attr.title]="f.evidence ? requestTitle(f.evidence) : null">
                    {{ f.evidence ? requestLabel(f.evidence) : '—' }}
                  </td>
                  <td class="px-4 h-10 text-right tabular-nums text-fg-muted" [class.opacity-60]="f.excluded">{{ f.request_count }}</td>
                  <td class="px-4 h-10">
                    @if (!readonly()) {
                      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
                      <div class="flex justify-end gap-2" (click)="$event.stopPropagation()">
                        @if (f.excluded) {
                          <app-button variant="ghost" size="sm" (click)="toggleExclude.emit(f)">
                            Re-include
                          </app-button>
                        } @else {
                          <app-button
                            variant="secondary"
                            size="sm"
                            (click)="toggleExclude.emit(f)">
                            Exclude
                          </app-button>
                        }
                      </div>
                    } @else {
                      <span class="text-xs text-fg-subtle italic block text-right">
                        {{ f.excluded ? 'excluded' : 'included' }}
                      </span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (expanded() && findings().length === 0) {
        <div class="px-4 py-3 text-xs text-fg-muted">No services in this group.</div>
      }
    </section>
  `
})
export class FindingsSectionComponent {
  readonly icons = { ChevronDown, ChevronRight };
  readonly originLabel = originLabel;

  readonly heading = input.required<string>();
  readonly severity = input.required<Severity>();
  readonly findings = input.required<Service[]>();
  // Owned by the parent, which needs to know which rows are on screen for its
  // keyboard cursor; `openChange` reports the user's toggles back.
  readonly open = model<boolean>(true);
  // False when the section is the only one shown (a single-group tab): no header
  // to collapse, the tab already names the group and its count.
  readonly collapsible = input<boolean>(true);
  readonly highlightedId = input<string | null>(null);
  // When true, this scan is submitted/frozen — hide the exclusion toggle UI
  // and render rows as read-only.
  readonly readonly = input<boolean>(false);

  readonly toggleExclude = output<Service>();
  readonly selectFinding = output<Service>();

  readonly expanded = computed(() => !this.collapsible() || this.open());

  /**
   * The evidence request as `METHOD /path`. The host is already in the Origin
   * column, and the query stays out of the cell since it is where a token
   * would sit; the tooltip carries the whole URL.
   */
  requestLabel(ev: ServiceUrl): string {
    return `${ev.method} ${requestPath(ev.url)}`;
  }

  /** The whole request for the cell's tooltip, redacted again client-side like the detail panel does. */
  requestTitle(ev: ServiceUrl): string {
    return `${ev.method} ${redact(ev.url)}`;
  }
}
