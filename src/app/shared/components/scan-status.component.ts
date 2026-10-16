import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ScanStatus } from '@core/models';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

// Glyphs are the `status_*_borderless` icons from @gitlab/svgs 3.167.1
// (MIT, 22x22 viewBox). Each status maps to the GitLab pipeline status it
// mirrors and to that status's ci-icon color variant.
const STATUSES: Record<ScanStatus, { label: string; variant: Variant; path: string }> = {
  completed: {
    label: 'Completed',
    variant: 'success', // status_success
    path: 'M9.866 12.095l-1.95-1.95a.462.462 0 00-.647.01l-.964.964a.46.46 0 00-.01.646l3.013 3.014a.787.787 0 001.106.008l.425-.425 4.854-4.853a.462.462 0 00.002-.659l-.964-.964a.468.468 0 00-.658.002l-4.207 4.207z'
  },
  failed: {
    label: 'Failed',
    variant: 'danger', // status_failed
    path: 'M11 9.38L8.798 7.178a.455.455 0 00-.65.006l-.964.965a.462.462 0 00-.006.65L9.38 11l-2.202 2.202a.455.455 0 00.006.65l.965.964a.462.462 0 00.65.006L11 12.62l2.202 2.202a.455.455 0 00.65-.006l.964-.965a.462.462 0 00.006-.65L12.62 11l2.202-2.202a.455.455 0 00-.006-.65l-.965-.964a.462.462 0 00-.65-.006L11 9.38z'
  },
  running: {
    label: 'Running',
    variant: 'info', // status_running
    path: 'M11 4.714c3.457 0 6.286 2.829 6.286 6.286 0 3.457-2.829 6.286-6.286 6.286-2.043 0-3.929-1.1-5.186-2.672L11 11V4.714'
  },
  queued: {
    label: 'Queued',
    variant: 'warning', // status_pending
    path: 'M7.386 8.329c0-.315.157-.472.471-.472h1.414c.315 0 .472.157.472.472v5.342c0 .315-.157.472-.472.472H7.857c-.314 0-.471-.157-.471-.472V8.33m4.714 0c0-.315.157-.472.471-.472h1.415c.314 0 .471.157.471.472v5.342c0 .315-.157.472-.471.472H12.57c-.314 0-.471-.157-.471-.472V8.33'
  },
  partial: {
    label: 'Partial',
    variant: 'warning', // status_warning ("passed with warnings")
    path: 'M9.429 5.5c0-.471.314-.786.785-.786h1.572c.471 0 .785.315.785.786v6.286c0 .471-.314.785-.785.785h-1.572c-.471 0-.785-.314-.785-.785V5.5m0 9.429c0-.472.314-.786.785-.786h1.572c.471 0 .785.314.785.786V16.5c0 .471-.314.786-.785.786h-1.572c-.471 0-.785-.315-.785-.786v-1.571'
  },
  cancelled: {
    label: 'Cancelled',
    variant: 'neutral', // status_canceled
    path: 'M8.171 5.971l7.7 7.7a.76.76 0 010 1.1l-1.1 1.1a.76.76 0 01-1.1 0l-7.7-7.7a.76.76 0 010-1.1l1.1-1.1a.76.76 0 011.1 0'
  }
};

/**
 * Scan status rendered as a GitLab CI status badge, using GitLab's dark-mode
 * ci-icon colors (gitlab-org/gitlab app/assets/stylesheets/root.scss, `.gl-dark`)
 * resolved against the @gitlab/ui dark palette. With `showText` it is the
 * pill-shaped badge GitLab shows in pipeline lists; without, just the icon.
 */
@Component({
  selector: 'app-scan-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'v-' + variant()",
    '[attr.aria-hidden]': 'showText() ? null : "true"'
  },
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
      border-radius: 20px;
      border: 2px solid var(--ci-bg);
      background-color: var(--ci-bg);
      color: var(--ci-text);
      font-size: 0.75rem;
    }
    :host(.v-success) { --ci-bg: #35b597; --ci-text: #003c36; --ci-icon: #35b597; --ci-icon-bg: #003c36; }
    :host(.v-warning) { --ci-bg: #fb8017; --ci-text: #5d220d; --ci-icon: #fb8017; --ci-icon-bg: #5d220d; }
    :host(.v-danger)  { --ci-bg: #fc7988; --ci-text: #641925; --ci-icon: #fc7988; --ci-icon-bg: #641925; }
    :host(.v-info)    { --ci-bg: #64a7e9; --ci-text: #1f3166; --ci-icon: #64a7e9; --ci-icon-bg: #1f3166; }
    :host(.v-neutral) { --ci-bg: #a5a3a3; --ci-text: #28272d; --ci-icon: #a5a3a3; --ci-icon-bg: #28272d; }
    .wrap {
      display: inline-block;
      border-radius: 9999px;
      line-height: 0;
      border: 2px solid transparent;
      background-color: var(--ci-icon-bg);
      color: var(--ci-icon);
    }
    .wrap svg { margin: -2px; }
    .text {
      margin: 0 0.5rem 0 0.25rem;
      white-space: nowrap;
      line-height: 1;
    }
  `],
  template: `
    <span class="wrap">
      <svg
        viewBox="0 0 22 22"
        [attr.width]="size() - 4"
        [attr.height]="size() - 4"
        fill="currentColor"
        aria-hidden="true">
        <path [attr.d]="path()" />
      </svg>
    </span>
    @if (showText()) {
      <span class="text">{{ label() }}</span>
    }
  `
})
export class ScanStatusComponent {
  readonly status = input.required<ScanStatus>();
  readonly showText = input(true);
  /** Outer diameter of the icon in px; GitLab's default is 24. */
  readonly size = input(24);

  readonly label = computed(() => STATUSES[this.status()].label);
  readonly variant = computed(() => STATUSES[this.status()].variant);
  readonly path = computed(() => STATUSES[this.status()].path);
}
