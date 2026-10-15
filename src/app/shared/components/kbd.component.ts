import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { keyLabels } from '@core/shortcuts/shortcut-keys';

/** A key binding drawn as keycaps: Ctrl + K. */
@Component({
  selector: 'app-kbd',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-1' },
  template: `
    @for (label of labels(); track $index) {
      <kbd
        class="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded border border-border-strong bg-surface-2 font-mono text-xs text-fg">
        {{ label }}
      </kbd>
    }
  `
})
export class KbdComponent {
  readonly binding = input.required<string>();
  readonly labels = computed(() => keyLabels(this.binding()));
}
