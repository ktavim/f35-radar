import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  viewChild
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from '../nav/nav.component';
import { TopBarComponent } from '../top-bar/top-bar.component';
import { ShortcutsDialogComponent } from '../shortcuts-dialog/shortcuts-dialog.component';
import { ErrorSignalService } from '@core/errors/error.signal';
import { ShortcutsService } from '@core/shortcuts/shortcuts.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, NavComponent, TopBarComponent, ShortcutsDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="h-screen overflow-hidden flex flex-col bg-bg text-fg"
      style="--app-sidebar-width: 14rem; --app-content-max-width: 1536px;">
      <app-top-bar class="shrink-0"></app-top-bar>
      
      <div class="flex-1 flex min-h-0">
        <aside class="w-56 shrink-0 border-r border-border bg-surface">
          <app-nav></app-nav>
        </aside>

        <div class="flex-1 min-w-0 min-h-0 flex flex-col relative">
          @if (forbidden()) {
            <div
              class="px-6 py-2 bg-danger/15 border-b border-danger/40 text-sm text-danger flex items-center justify-between"
              role="alert">
              <span>You don't have permission to perform that action.</span>
              <button
                type="button"
                class="text-xs underline"
                (click)="dismissForbidden()">
                Dismiss
              </button>
            </div>
          }
          <main class="flex-1 min-w-0 min-h-0 max-w-screen-2xl w-full px-6 py-6 overflow-y-auto thin-scroll">
            <router-outlet></router-outlet>
          </main>
        </div>
      </div>
    </div>
    <app-shortcuts-dialog></app-shortcuts-dialog>
  `
})
export class ShellComponent {
  private readonly errors = inject(ErrorSignalService);
  private readonly shortcuts = inject(ShortcutsService);
  private readonly shortcutsDialog = viewChild.required(ShortcutsDialogComponent);
  readonly forbidden = computed(() => this.errors.forbidden() != null);

  dismissForbidden() {
    this.errors.clearForbidden();
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (this.shortcuts.match(e, 'global') === 'global.help') {
      e.preventDefault();
      this.shortcutsDialog().open();
    }
  }
}
