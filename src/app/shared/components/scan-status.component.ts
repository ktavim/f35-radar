import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ScanStatus } from '@core/models';

const LABELS: Record<ScanStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  partial: 'Partial',
  failed: 'Failed',
  cancelled: 'Cancelled'
};

// GitLab-pipeline-style palette: queued mirrors GitLab's "pending" and partial
// its "passed with warnings", so both are orange and told apart by the glyph.
const COLORS: Record<ScanStatus, string> = {
  queued: 'var(--color-warn)',
  running: 'var(--color-info)',
  completed: 'var(--color-success)',
  partial: 'var(--color-warn)',
  failed: 'var(--color-danger)',
  cancelled: 'var(--color-fg-subtle)'
};

/**
 * Scan status as a GitLab-style pipeline icon (a filled circle with a glyph,
 * inside a soft halo) followed by its label. The label inherits the
 * surrounding text color so the component also works inside filter buttons.
 */
@Component({
  selector: 'app-scan-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 0.375rem; }
    @keyframes scan-status-spin { to { transform: rotate(360deg); } }
    .spin {
      transform-box: view-box;
      transform-origin: 50% 50%;
      animation: scan-status-spin 1.6s linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .spin { animation: none; }
    }
  `],
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      class="shrink-0"
      [style.color]="color()"
      aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="currentColor" opacity="0.22" />
      @switch (status()) {
        @case ('running') {
          <circle cx="12" cy="12" r="7.25" fill="var(--color-bg)" stroke="currentColor" stroke-width="1.5" />
          <path class="spin" d="M12 7.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" />
        }
        @default {
          <circle cx="12" cy="12" r="8" fill="currentColor" />
          <g fill="none" stroke="var(--color-bg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            @switch (status()) {
              @case ('completed') { <path d="M8.75 12.25l2.25 2.25 4.25-4.5" /> }
              @case ('failed') { <path d="M9.75 9.75l4.5 4.5M14.25 9.75l-4.5 4.5" /> }
              @case ('queued') { <path d="M10.25 9.5v5M13.75 9.5v5" /> }
              @case ('partial') {
                <path d="M12 8.75v3.5" />
                <circle cx="12" cy="15.25" r="0.4" />
              }
              @case ('cancelled') {
                <g stroke-width="1.5">
                  <circle cx="12" cy="12" r="3.5" />
                  <path d="M9.5 14.5l5-5" />
                </g>
              }
            }
          </g>
        }
      }
    </svg>
    <span class="text-xs font-medium">{{ label() }}</span>
  `
})
export class ScanStatusComponent {
  readonly status = input.required<ScanStatus>();
  readonly size = input(18);

  readonly label = computed(() => LABELS[this.status()]);
  readonly color = computed(() => COLORS[this.status()]);
}
