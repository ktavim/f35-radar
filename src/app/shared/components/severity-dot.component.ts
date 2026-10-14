import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { severityColor } from '@lib/verdict';
import type { Severity } from '@core/models';

@Component({
  selector: 'app-severity-dot',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="sev-dot" [style.background]="color()" aria-hidden="true"></span>`
})
export class SeverityDotComponent {
  readonly severity = input.required<Severity>();
  color = computed(() => severityColor(this.severity()));
}
