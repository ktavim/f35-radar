import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideAngularModule, OctagonX, CircleCheck, TriangleAlert } from 'lucide-angular';

// blocked: a bandit not excluded. review: only bogeys not excluded, which
// refuse submit too but are resolved by filling in their method. clear: neither.
type Tone = 'blocked' | 'review' | 'clear';

@Component({
  selector: 'app-verdict-banner',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="relative overflow-hidden border rounded-md p-5 flex items-start gap-5 transition-colors"
      [class.border-danger/30]="tone() === 'blocked'"
      [class.bg-danger/5]="tone() === 'blocked'"
      [class.border-warn/30]="tone() === 'review'"
      [class.bg-warn/5]="tone() === 'review'"
      [class.border-success/30]="tone() === 'clear'"
      [class.bg-success/5]="tone() === 'clear'"
      role="status">

      <!-- Left accent stripe -->
      <div
        class="absolute left-0 top-0 bottom-0 w-1.5"
        [class.bg-danger]="tone() === 'blocked'"
        [class.bg-warn]="tone() === 'review'"
        [class.bg-success]="tone() === 'clear'">
      </div>

      <div
        class="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
        [class.bg-danger/10]="tone() === 'blocked'"
        [class.text-danger]="tone() === 'blocked'"
        [class.bg-warn/10]="tone() === 'review'"
        [class.text-warn]="tone() === 'review'"
        [class.bg-success/10]="tone() === 'clear'"
        [class.text-success]="tone() === 'clear'">
        <lucide-icon
          [name]="icon()"
          [size]="24"
          aria-hidden="true">
        </lucide-icon>
      </div>

      <div class="flex-1 pt-0.5">
        <h3 class="text-lg font-bold text-fg leading-tight">{{ title() }}</h3>
        @if (detail()) {
          <p class="text-sm text-fg-muted mt-1.5 leading-relaxed">{{ detail() }}</p>
        }
      </div>
    </div>
  `
})
export class VerdictBannerComponent {
  readonly blockerCount = input.required<number>();
  readonly reviewCount = input<number>(0);
  readonly exposeCount = input.required<number>();

  readonly tone = computed<Tone>(() =>
    this.blockerCount() > 0 ? 'blocked' : this.reviewCount() > 0 ? 'review' : 'clear'
  );

  readonly icon = computed(() => {
    switch (this.tone()) {
      case 'blocked':
        return OctagonX;
      case 'review':
        return TriangleAlert;
      case 'clear':
        return CircleCheck;
    }
  });

  readonly title = computed(() => {
    const n = this.blockerCount();
    const r = this.reviewCount();
    if (n > 0) return `${n} blocking ${n === 1 ? 'issue' : 'issues'}`;
    if (r > 0) return `${r} ${r === 1 ? 'service' : 'services'} to review`;
    return 'No blocking issues';
  });

  readonly detail = computed(() => {
    const n = this.blockerCount();
    const r = this.reviewCount();
    if (n > 0) {
      const reviews = r > 0 ? ` ${r} more ${r === 1 ? 'service needs' : 'services need'} an auth method set or excluding.` : '';
      return `Unsupported auth method (NTLM, Basic or an unrecognised scheme) on ${n} ${n === 1 ? 'service' : 'services'}. Exclude or change auth method, then re-scan.${reviews}`;
    }
    if (r > 0) {
      return `The scanners couldn't tell the auth method of ${r} ${r === 1 ? 'service' : 'services'}. Set it or exclude ${r === 1 ? 'it' : 'them'} before submitting.`;
    }
    return `${this.exposeCount()} external services will be exposed.`;
  });
}
