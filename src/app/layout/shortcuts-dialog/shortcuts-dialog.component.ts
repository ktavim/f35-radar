import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShortcutsService } from '@core/shortcuts/shortcuts.service';
import { FIXED_KEYS, SHORTCUT_SCOPES, SHORTCUTS } from '@core/shortcuts/shortcuts';
import { KbdComponent } from '@shared/components/kbd.component';

/** The cheatsheet `?` opens. Lists the user's own bindings, not the defaults. */
@Component({
  selector: 'app-shortcuts-dialog',
  standalone: true,
  imports: [RouterLink, KbdComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Keys stop here so j/k/x don't act on the page behind the dialog. -->
    <dialog
      #dialog
      aria-labelledby="shortcuts-title"
      tabindex="-1"
      class="w-full max-w-lg p-0 rounded-md bg-surface text-fg border border-border shadow-lg backdrop:bg-black/50"
      (keydown)="$event.stopPropagation()"
      (click)="onDialogClick($event)">
      <div>
        <header class="flex items-center justify-between px-4 h-11 border-b border-border">
          <h2 id="shortcuts-title" class="text-sm font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            class="text-fg-muted hover:text-fg text-lg leading-none"
            aria-label="Close"
            (click)="close()">×</button>
        </header>

        <div class="px-4 py-3 space-y-4 max-h-[70vh] overflow-y-auto thin-scroll">
          @if (!shortcuts.characterKeysEnabled()) {
            <p class="text-xs text-fg-muted">
              Single-key shortcuts are turned off, so those marked "off" do nothing.
            </p>
          }
          @for (group of groups(); track group.key) {
            <section>
              <h3 class="text-xs uppercase tracking-wide text-fg-muted mb-1">
                {{ group.label }}
                @if (group.hint) {
                  <span class="normal-case tracking-normal text-fg-subtle">· {{ group.hint }}</span>
                }
              </h3>
              <dl>
                @for (s of group.shortcuts; track s.id) {
                  <div class="flex items-center justify-between gap-4 py-1">
                    <dt class="text-sm">{{ s.label }}</dt>
                    <dd class="flex items-center gap-2">
                      @if (shortcuts.isSuppressed(s.id)) {
                        <span class="text-xs text-fg-subtle">off</span>
                      }
                      <app-kbd [binding]="shortcuts.keyFor(s.id)"></app-kbd>
                    </dd>
                  </div>
                }
              </dl>
            </section>
          }
          <section>
            <h3 class="text-xs uppercase tracking-wide text-fg-muted mb-1">Always</h3>
            <dl>
              @for (f of fixedKeys; track f.label) {
                <div class="flex items-center justify-between gap-4 py-1">
                  <dt class="text-sm">{{ f.label }}</dt>
                  <dd class="flex items-center gap-1">
                    @for (k of f.keys; track k) {
                      <app-kbd [binding]="k"></app-kbd>
                    }
                  </dd>
                </div>
              }
            </dl>
          </section>
        </div>

        <footer class="px-4 h-11 flex items-center border-t border-border">
          <a routerLink="/settings" class="text-sm text-accent hover:underline" (click)="close()">
            Change shortcuts in Settings
          </a>
        </footer>
      </div>
    </dialog>
  `
})
export class ShortcutsDialogComponent {
  readonly shortcuts = inject(ShortcutsService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly fixedKeys = FIXED_KEYS;

  readonly groups = computed(() =>
    SHORTCUT_SCOPES.map((scope) => ({
      ...scope,
      shortcuts: SHORTCUTS.filter((s) => s.scope === scope.key)
    }))
  );

  open() {
    const el = this.dialog().nativeElement;
    if (!el.open) el.showModal();
  }

  close() {
    this.dialog().nativeElement.close();
  }

  // A click that lands on the <dialog> itself, not its content, hit the backdrop.
  onDialogClick(e: MouseEvent) {
    if (e.target === this.dialog().nativeElement) this.close();
  }
}
