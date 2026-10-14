import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { authMethodColor, authMethodLabel } from '@lib/verdict';
import type { AuthMethod } from '@core/models';

@Component({
  selector: 'app-auth-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-mono border border-border bg-surface">
      <span class="sev-dot" [style.background]="color()"></span>
      <span>{{ label() }}</span>
    </span>
  `
})
export class AuthPillComponent {
  readonly method = input.required<AuthMethod>();

  label = computed(() => authMethodLabel(this.method()));

  // Mirrors the backend's severity for the method, so the pill and the group
  // a service lands in never disagree.
  color = computed(() => authMethodColor(this.method()));
}
