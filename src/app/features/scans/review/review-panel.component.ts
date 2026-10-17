import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  signal
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { VerdictBannerComponent } from './verdict-banner.component';
import { FindingsSectionComponent } from './findings-section.component';
import { FindingDetailPanelComponent } from './finding-detail-panel.component';
import { ButtonComponent } from '@shared/ui/button.component';
import { SeverityDotComponent } from '@shared/components/severity-dot.component';
import { useSetAuthMethodMutation, useToggleExclusionMutation } from '../data/scans.queries';
import { ToastService } from '@shared/ui/toast.service';
import { ShortcutsService } from '@core/shortcuts/shortcuts.service';
import { isTypingTarget } from '@core/shortcuts/shortcut-keys';
import { authMethodLabel, blocksSubmit, canSetAuthMethod } from '@lib/verdict';
import type { AuthMethod, Service, Severity } from '@core/models';

type Tab = 'all' | Severity;

const GROUPS: { key: Severity; heading: string }[] = [
  { key: 'blocker', heading: 'Bandits' },
  { key: 'review', heading: 'Bogeys' },
  { key: 'cleared', heading: 'Friendlies' },
  // "Leakers" in brevity code: contacts that got through a defensive layer.
  // Already published through the F5 by a workaround the scanners can't
  // see: nothing is left to configure, whatever auth method was detected.
  { key: 'published', heading: 'Leakers' }
];

const TABS: Tab[] = ['all', ...GROUPS.map((g) => g.key)];

function parseTab(value: string | null): Tab | null {
  return TABS.find((t) => t === value) ?? null;
}

@Component({
  selector: 'app-review-panel',
  standalone: true,
  imports: [
    VerdictBannerComponent,
    FindingsSectionComponent,
    FindingDetailPanelComponent,
    ButtonComponent,
    SeverityDotComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { tabindex: '-1' },
  template: `
    <div class="space-y-6">
      <app-verdict-banner
        class="block mb-8"
        [blockerCount]="unexcludedBlockers().length"
        [reviewCount]="unexcludedReviews().length"
        [exposeCount]="exposeCount()">
      </app-verdict-banner>

      <div>
        <div
          role="tablist"
          aria-label="Findings"
          class="flex items-center gap-1 border-b border-border mb-4">
          @for (t of tabs(); track t.key) {
            <button
              type="button"
              role="tab"
              (keydown)="onTabKey($event)"
              class="flex items-center gap-2 px-3 h-9 -mb-px border-b-2 text-sm hover:text-fg"
              [id]="'review-tab-' + t.key"
              [attr.aria-selected]="activeTab() === t.key"
              aria-controls="review-tabpanel"
              [attr.tabindex]="activeTab() === t.key ? 0 : -1"
              [class.border-accent]="activeTab() === t.key"
              [class.text-fg]="activeTab() === t.key"
              [class.font-medium]="activeTab() === t.key"
              [class.border-transparent]="activeTab() !== t.key"
              [class.text-fg-muted]="activeTab() !== t.key"
              (click)="selectTab(t.key)">
              @if (t.key !== 'all') {
                <app-severity-dot [severity]="t.key"></app-severity-dot>
              }
              <span>{{ t.label }}</span>
              <span class="text-xs text-fg-muted tabular-nums">({{ t.count }})</span>
            </button>
          }
        </div>

        <div
          role="tabpanel"
          id="review-tabpanel"
          [attr.aria-labelledby]="'review-tab-' + activeTab()">
          @for (g of shownGroups(); track g.key) {
            <app-findings-section
              [heading]="g.heading"
              [severity]="g.key"
              [findings]="g.findings"
              [collapsible]="activeTab() === 'all'"
              [open]="openState()[g.key]"
              (openChange)="setOpen(g.key, $event)"
              [highlightedId]="cursorId()"
              [readonly]="isFrozen()"
              (toggleExclude)="onToggle($event)"
              (selectFinding)="select($event)">
            </app-findings-section>
          }
        </div>
      </div>

      <div class="flex items-center justify-between pt-4 border-t border-border">
        <p class="text-xs text-fg-muted">
          @if (isFrozen()) {
            This scan is locked — only the latest completed scan can be edited.
          }
        </p>
        <div class="flex items-center gap-2">
          @if (submitDisabled()) {
            <span
              class="text-xs text-fg-muted"
              [attr.title]="submitTooltip()">
              {{ submitTooltip() }}
            </span>
          }
          <app-button
            variant="primary"
            size="lg"
            [disabled]="submitDisabled()"
            (click)="goToSubmit()">
            Submit scan
          </app-button>
        </div>
      </div>
    </div>

    <app-finding-detail-panel
      [scanId]="scanId()"
      [finding]="selected()"
      [readonly]="isFrozen()"
      (closePanel)="selectedId.set(null)"
      (toggleExclude)="onToggle($event)"
      (setAuthMethod)="onSetAuthMethod($event)">
    </app-finding-detail-panel>
  `
})
export class ReviewPanelComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly toast = inject(ToastService);
  private readonly shortcuts = inject(ShortcutsService);

  readonly scanId = input.required<string>();
  readonly findings = input.required<Service[]>();
  readonly isLatestScan = input<boolean>(true);
  readonly isFrozen = input<boolean>(false);
  // Mirrors the backend rule: only `completed` scans are submittable. Default
  // true so existing call sites that don't supply this don't regress.
  readonly isCompleted = input<boolean>(true);

  // The open detail panel's service, read from the findings rather than kept
  // as a copy, so it follows optimistic updates and their rollbacks.
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(() => {
    const id = this.selectedId();
    return this.findings().find((f) => f.id === id) ?? null;
  });

  // The tab the user picked, kept in the URL (?tab=) so a reload or a shared
  // link lands on the same tab. Null until they pick one.
  private readonly chosenTab = signal<Tab | null>(
    parseTab(this.route.snapshot.queryParamMap.get('tab'))
  );

  readonly groups = computed(() =>
    GROUPS.map((g) => ({
      ...g,
      findings: this.findings().filter((f) => f.severity === g.key)
    }))
  );

  // Without a pick, open on the first group that needs a decision: Bandits, then
  // Bogeys, else the All overview. Counted with excluded findings included, so
  // excluding the last bandit does not yank the user off the tab they work in.
  private readonly defaultTab = computed<Tab>(
    () =>
      this.groups().find(
        (g) => (g.key === 'blocker' || g.key === 'review') && g.findings.length > 0
      )?.key ?? 'all'
  );

  readonly activeTab = computed<Tab>(() => this.chosenTab() ?? this.defaultTab());

  readonly tabs = computed(() => [
    { key: 'all' as Tab, label: 'All', count: this.findings().length },
    ...this.groups().map((g) => ({ key: g.key as Tab, label: g.heading, count: g.findings.length }))
  ]);

  readonly shownGroups = computed(() => {
    const tab = this.activeTab();
    return tab === 'all' ? this.groups() : this.groups().filter((g) => g.key === tab);
  });

  // Which groups are expanded on the All tab. Bandits and Bogeys start open when
  // they have findings, until the user toggles a group themselves.
  private readonly openOverrides = signal<Partial<Record<Severity, boolean>>>({});

  readonly openState = computed(() => {
    const overrides = this.openOverrides();
    const state = {} as Record<Severity, boolean>;
    for (const g of this.groups()) {
      state[g.key] =
        overrides[g.key] ?? ((g.key === 'blocker' || g.key === 'review') && g.findings.length > 0);
    }
    return state;
  });

  // The rows on screen, in display order: the active tab's group, or on the All
  // tab every expanded group. The keyboard cursor only ever moves over these.
  readonly visibleFindings = computed(() => {
    const open = this.openState();
    return this.shownGroups()
      .filter((g) => this.activeTab() !== 'all' || open[g.key])
      .flatMap((g) => g.findings);
  });

  private readonly cursor = signal<string | null>(null);

  // The row j/k/x/Enter act on. Tracked by id, and when that row is not on screen
  // (another tab, a collapsed group) it falls back to the first visible row, so
  // `x` can never exclude a finding the user cannot see.
  readonly cursorId = computed<string | null>(() => {
    const list = this.visibleFindings();
    const id = this.cursor();
    return list.some((f) => f.id === id) ? id : (list[0]?.id ?? null);
  });

  // What submit refuses on (see `blocksSubmit`), split by severity because each
  // is resolved differently: a bandit is excluded or remediated, a bogey gets
  // its auth method set or is excluded.
  private readonly unresolved = computed(() => this.findings().filter(blocksSubmit));

  readonly unexcludedBlockers = computed(() =>
    this.unresolved().filter((f) => f.severity === 'blocker')
  );

  readonly unexcludedReviews = computed(() =>
    this.unresolved().filter((f) => f.severity === 'review')
  );

  readonly exposeCount = computed(() =>
    this.findings().filter((f) => !f.excluded).length
  );

  readonly submitDisabled = computed(
    () =>
      this.unresolved().length > 0 ||
      !this.isLatestScan() ||
      this.isFrozen() ||
      !this.isCompleted()
  );

  readonly submitTooltip = computed(() => {
    // Order matters: most specific reason first. "submitted" implies frozen
    // for an audit-trail reason; "not latest" / "not completed" implies the
    // scan can't be the canonical version. We don't pile multiple reasons in
    // one tooltip — pick the one the user can act on.
    if (!this.isCompleted()) {
      return 'Only completed scans can be submitted.';
    }
    if (!this.isLatestScan()) {
      return 'Only the latest completed scan can be submitted. Run a new scan to update.';
    }
    if (this.isFrozen()) {
      return 'This scan is locked.';
    }
    const b = this.unexcludedBlockers().length;
    const r = this.unexcludedReviews().length;
    if (b > 0 && r > 0) {
      return `${b} ${b === 1 ? 'bandit' : 'bandits'} and ${r} ${r === 1 ? 'bogey' : 'bogeys'} must be resolved before submitting.`;
    }
    if (b > 0) {
      return `${b} ${b === 1 ? 'bandit must be excluded' : 'bandits must be excluded'} or remediated before submitting.`;
    }
    if (r > 0) {
      return `Set the auth method of ${r} ${r === 1 ? 'bogey, or exclude it,' : 'bogeys, or exclude them,'} before submitting.`;
    }
    return '';
  });

  private readonly toggleMutation = useToggleExclusionMutation({
    onRollback: (args) => {
      this.toast.error(
        'Reverted',
        `Could not ${args.excluded ? 'exclude' : 're-include'} finding — change rolled back.`
      );
    }
  });

  private readonly authMethodMutation = useSetAuthMethodMutation({
    onRollback: () => {
      this.toast.error('Reverted', 'Could not update auth method — change rolled back.');
    },
    onSuccess: (args) => {
      const label = authMethodLabel(args.authMethod);
      const service = this.findings().find((f) => f.id === args.findingId);
      if (service?.scanners_auth_method === args.authMethod) {
        this.toast.success('Correction undone', `Back to the scanners' verdict, ${label}.`);
      } else {
        this.toast.success('Auth method updated', `Finding set to ${label}.`);
      }
    }
  });

  select(f: Service) {
    this.selectedId.set(f.id);
  }

  selectTab(tab: Tab) {
    this.chosenTab.set(tab);
    this.router.navigate([], {
      relativeTo: this.route,
      // Written even for All: the default is not All when there are bandits.
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  setOpen(key: Severity, open: boolean) {
    this.openOverrides.update((o) => ({ ...o, [key]: open }));
  }

  // Arrow keys move between tabs and select as they go (WAI-ARIA tabs pattern).
  onTabKey(e: KeyboardEvent) {
    const i = TABS.indexOf(this.activeTab());
    let next: number;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    this.selectTab(TABS[next]);
    this.host.nativeElement.querySelector<HTMLElement>(`#review-tab-${TABS[next]}`)?.focus();
  }

  onSetAuthMethod(e: { finding: Service; method: AuthMethod }) {
    // Guard mirrors the backend: only the latest, unsubmitted scan is editable,
    // and only where the scanners could not tell the method (unknown,
    // no_response, dns_failed) or its mechanism (negotiate). Keyed by their
    // verdict, so a correction can be changed or undone.
    if (this.isFrozen() || !canSetAuthMethod(e.finding, e.method)) return;
    this.authMethodMutation.mutate({
      scanId: this.scanId(),
      findingId: e.finding.id,
      authMethod: e.method
    });
  }

  onToggle(f: Service) {
    // Frozen scans don't emit toggles from the UI; this is a belt-and-suspenders
    // guard against keyboard shortcuts or programmatic triggers.
    if (this.isFrozen()) return;
    this.toggleMutation.mutate({
      scanId: this.scanId(),
      findingId: f.id,
      excluded: !f.excluded
    });
  }

  goToSubmit() {
    if (this.submitDisabled()) return;
    this.router.navigate(['/scans', this.scanId(), 'submit']);
  }

  private moveCursor(step: number) {
    const list = this.visibleFindings();
    if (list.length === 0) return;
    const i = list.findIndex((f) => f.id === this.cursorId());
    this.cursor.set(list[Math.max(0, Math.min(list.length - 1, i + step))].id);
  }

  private cursorFinding(): Service | undefined {
    const id = this.cursorId();
    return this.visibleFindings().find((f) => f.id === id);
  }

  private stepTab(step: number) {
    const i = TABS.indexOf(this.activeTab());
    this.selectTab(TABS[(i + step + TABS.length) % TABS.length]);
  }

  // Review screen shortcuts; the keys are the user's, from Settings.
  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (!isTypingTarget(e.target)) this.selectedId.set(null);
      return;
    }
    const action = this.shortcuts.match(e, 'review');
    if (action == null) return;
    e.preventDefault();
    switch (action) {
      case 'review.next':
        this.moveCursor(1);
        break;
      case 'review.prev':
        this.moveCursor(-1);
        break;
      case 'review.nextTab':
        this.stepTab(1);
        break;
      case 'review.prevTab':
        this.stepTab(-1);
        break;
      case 'review.toggleExclusion': {
        if (this.isFrozen()) return;
        const f = this.cursorFinding();
        if (f) this.onToggle(f);
        break;
      }
      case 'review.open': {
        const f = this.cursorFinding();
        if (f) this.select(f);
        break;
      }
    }
  }
}
