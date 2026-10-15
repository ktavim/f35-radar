import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { KbdComponent } from '@shared/components/kbd.component';
import { ButtonComponent } from '@shared/ui/button.component';
import { AuthService } from '@core/services/auth.service';
import { ShortcutsService } from '@core/shortcuts/shortcuts.service';
import { FIXED_KEYS, SHORTCUT_SCOPES, SHORTCUTS, type ShortcutId } from '@core/shortcuts/shortcuts';
import { describeKey, eventToKey, isCharacterKey } from '@core/shortcuts/shortcut-keys';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [PageHeaderComponent, KbdComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Settings" [subtitle]="subtitle()"></app-page-header>

    <section aria-labelledby="shortcuts-heading" class="max-w-3xl space-y-4">
      <div class="flex items-end justify-between gap-4">
        <div>
          <h2 id="shortcuts-heading" class="text-base font-semibold">Keyboard shortcuts</h2>
          <p class="text-sm text-fg-muted mt-1">
            Click a shortcut, then press the new key or combination. Esc cancels.
          </p>
        </div>
        <app-button [disabled]="!shortcuts.anyCustomized()" (click)="resetAll()">
          Reset all to defaults
        </app-button>
      </div>

      <label class="flex items-start gap-3 rounded-md border border-border bg-surface p-3 cursor-pointer">
        <input
          type="checkbox"
          class="mt-0.5"
          [checked]="shortcuts.characterKeysEnabled()"
          (change)="shortcuts.setCharacterKeysEnabled($any($event.target).checked)" />
        <span>
          <span class="block text-sm font-medium">Single-key shortcuts</span>
          <span class="block text-xs text-fg-muted mt-0.5">
            Shortcuts that are one character, like J or ?. Turn this off if you use speech
            input or trigger them by accident. Shortcuts with Ctrl, Alt or a key like Enter
            keep working.
          </span>
        </span>
      </label>

      <!-- Announces a rejected key, or the new binding, to screen readers. -->
      <p class="sr-only" aria-live="polite">{{ announcement() }}</p>

      @for (group of groups(); track group.key) {
        <div class="rounded-md border border-border bg-surface">
          <h3 class="px-4 h-9 flex items-center gap-1 text-xs uppercase tracking-wide text-fg-muted border-b border-border">
            {{ group.label }}
            @if (group.hint) {
              <span class="normal-case tracking-normal text-fg-subtle">· {{ group.hint }}</span>
            }
          </h3>
          <ul>
            @for (s of group.shortcuts; track s.id) {
              <li class="px-4 py-2 border-b border-border last:border-0">
                <div class="flex items-center gap-3">
                  <span class="flex-1 text-sm">{{ s.label }}</span>
                  @if (shortcuts.isSuppressed(s.id)) {
                    <span class="text-xs text-fg-subtle" title="Single-key shortcuts are off">off</span>
                  }
                  <button
                    type="button"
                    class="min-w-[9rem] h-8 px-2 inline-flex items-center justify-center rounded-md border text-xs hover:border-border-strong"
                    [class.border-accent]="recording() === s.id"
                    [class.border-border]="recording() !== s.id"
                    [attr.aria-label]="recorderLabel(s.id, s.label)"
                    [attr.aria-describedby]="error()?.id === s.id ? 'shortcut-error-' + s.id : null"
                    (click)="startRecording(s.id)"
                    (keydown)="onRecorderKey($event, s.id)"
                    (blur)="stopRecording()">
                    @if (recording() === s.id) {
                      <span class="text-fg-muted">Press keys…</span>
                    } @else {
                      <app-kbd [binding]="shortcuts.keyFor(s.id)"></app-kbd>
                    }
                  </button>
                  <!-- Keeps the column width when there is nothing to reset. -->
                  <span class="w-14 flex justify-end">
                    @if (shortcuts.isCustomized(s.id)) {
                      <button
                        type="button"
                        class="text-xs text-fg-muted hover:text-fg underline"
                        [attr.aria-label]="'Reset ' + s.label + ' to ' + describe(s.defaultKey)"
                        (click)="reset(s.id)">
                        Reset
                      </button>
                    }
                  </span>
                </div>
                @if (error()?.id === s.id) {
                  <p [id]="'shortcut-error-' + s.id" class="text-xs text-danger mt-1">
                    {{ error()!.message }}
                  </p>
                }
              </li>
            }
          </ul>
        </div>
      }

      <div class="rounded-md border border-border bg-surface">
        <h3 class="px-4 h-9 flex items-center text-xs uppercase tracking-wide text-fg-muted border-b border-border">
          Fixed
        </h3>
        <ul>
          @for (f of fixedKeys; track f.label) {
            <li class="px-4 py-2 border-b border-border last:border-0 flex items-center gap-3">
              <span class="flex-1 text-sm text-fg-muted">{{ f.label }}</span>
              <span class="flex items-center gap-1">
                @for (k of f.keys; track k) {
                  <app-kbd [binding]="k"></app-kbd>
                }
              </span>
            </li>
          }
        </ul>
      </div>
    </section>
  `
})
export class SettingsComponent {
  readonly shortcuts = inject(ShortcutsService);
  private readonly auth = inject(AuthService);

  readonly fixedKeys = FIXED_KEYS;
  readonly describe = describeKey;

  readonly subtitle = computed(() => {
    const user = this.auth.currentUser()?.username;
    return user ? `Saved in this browser for ${user}.` : 'Saved in this browser.';
  });

  readonly groups = computed(() =>
    SHORTCUT_SCOPES.map((scope) => ({
      ...scope,
      shortcuts: SHORTCUTS.filter((s) => s.scope === scope.key)
    }))
  );

  readonly recording = signal<ShortcutId | null>(null);
  readonly error = signal<{ id: ShortcutId; message: string } | null>(null);
  readonly announcement = signal('');

  recorderLabel(id: ShortcutId, label: string): string {
    return this.recording() === id
      ? `Press the new shortcut for ${label}, or Escape to cancel`
      : `${label}: ${describeKey(this.shortcuts.keyFor(id))}. Change`;
  }

  startRecording(id: ShortcutId) {
    this.recording.set(id);
    this.error.set(null);
  }

  stopRecording() {
    this.recording.set(null);
  }

  onRecorderKey(e: KeyboardEvent, id: ShortcutId) {
    // Until recording starts, Enter and Space just click the button.
    if (this.recording() !== id) return;
    // Tab still moves focus, so the recorder never traps a keyboard user.
    if (e.key === 'Tab') return;
    // Nothing else reaches the page, or `?` would open the cheatsheet mid-recording.
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      this.stopRecording();
      return;
    }
    const key = eventToKey(e);
    if (key == null) return; // a bare modifier: wait for the rest of the combo
    const label = SHORTCUTS.find((s) => s.id === id)!.label;
    const clash = this.shortcuts.conflictFor(id, key);
    if (clash) {
      const message = `${describeKey(key)} is already used for "${clash.label}". Press another key.`;
      this.error.set({ id, message });
      this.announcement.set(message);
      return;
    }
    this.shortcuts.setBinding(id, key);
    this.error.set(null);
    this.stopRecording();
    this.announcement.set(
      !this.shortcuts.characterKeysEnabled() && isCharacterKey(key)
        ? `${label} set to ${describeKey(key)}, but single-key shortcuts are off.`
        : `${label} set to ${describeKey(key)}.`
    );
  }

  reset(id: ShortcutId) {
    this.shortcuts.resetBinding(id);
    this.error.set(null);
  }

  resetAll() {
    this.shortcuts.resetAll();
    this.error.set(null);
    this.announcement.set('All shortcuts reset to their defaults.');
  }
}
