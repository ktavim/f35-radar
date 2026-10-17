import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { authMethodColor, authMethodLabel } from '@lib/verdict';
import type { AuthMethod } from '@core/models';

@Component({
  selector: 'app-auth-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-mono border border-border bg-surface"
      [attr.title]="title()">
      <span class="sev-dot" [style.background]="color()"></span>
      <span>{{ label() }}</span>
      @if (correctedFrom()) {
        <span class="ml-0.5 pl-1.5 border-l border-border text-[10px] uppercase tracking-wide text-fg-muted">manual</span>
      }
    </span>
  `
})
export class AuthPillComponent {
  readonly method = input.required<AuthMethod>();
  // Greys the dot for an excluded service, so a dropped row doesn't still
  // signal severity; the label keeps naming the method.
  readonly muted = input<boolean>(false);
  // The scanners' verdict when a person set the method by hand, which marks
  // the pill as manual; null for the scanners' own method.
  readonly correctedFrom = input<AuthMethod | null>(null);

  label = computed(() => authMethodLabel(this.method()));

  // Mirrors the backend's severity for the method, so the pill and the group
  // a service lands in never disagree.
  color = computed(() => (this.muted() ? 'var(--color-fg-muted)' : authMethodColor(this.method())));

  title = computed(() => {
    const from = this.correctedFrom();
    return from ? `Set manually; the scanners found ${authMethodLabel(from)}.` : null;
  });
}
