import { Injectable, computed, inject, linkedSignal } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { SHORTCUTS, type ShortcutDef, type ShortcutId, type ShortcutScope } from './shortcuts';
import { activatesOnKey, eventToKey, isCharacterKey, isTypingTarget } from './shortcut-keys';

// Saved per user, in this browser only: there is no preferences endpoint yet.
const STORAGE_PREFIX = 'eg.shortcuts.';

interface Prefs {
  // Only the bindings the user changed; everything else uses its default.
  bindings: Partial<Record<ShortcutId, string>>;
  characterKeys: boolean;
}

const DEFAULT_PREFS: Prefs = { bindings: {}, characterKeys: true };

function loadPrefs(storageKey: string): Prefs {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  } catch {
    return DEFAULT_PREFS;
  }
  if (typeof raw !== 'object' || raw == null) return DEFAULT_PREFS;
  const stored = raw as { bindings?: Record<string, unknown>; characterKeys?: unknown };
  const bindings: Prefs['bindings'] = {};
  for (const s of SHORTCUTS) {
    const key = stored.bindings?.[s.id];
    if (typeof key === 'string' && key !== '') bindings[s.id] = key;
  }
  return {
    bindings,
    characterKeys: typeof stored.characterKeys === 'boolean' ? stored.characterKeys : true
  };
}

// Two shortcuts clash when the same keypress would reach both: same scope, or
// either one global. Review and terminal shortcuts may share a key, because
// the focused terminal handles its keys first.
function overlaps(a: ShortcutScope, b: ShortcutScope): boolean {
  return a === b || a === 'global' || b === 'global';
}

@Injectable({ providedIn: 'root' })
export class ShortcutsService {
  private readonly auth = inject(AuthService);

  private readonly storageKey = computed(
    () => STORAGE_PREFIX + (this.auth.currentUser()?.username || 'anonymous')
  );

  private readonly prefs = linkedSignal(() => loadPrefs(this.storageKey()));

  /** When false, shortcuts that are one character with no Ctrl/Alt/Meta are ignored. */
  readonly characterKeysEnabled = computed(() => this.prefs().characterKeys);

  readonly bindings = computed(() => {
    const custom = this.prefs().bindings;
    const all = {} as Record<ShortcutId, string>;
    for (const s of SHORTCUTS) all[s.id] = custom[s.id] ?? s.defaultKey;
    return all;
  });

  readonly anyCustomized = computed(() => Object.keys(this.prefs().bindings).length > 0);

  keyFor(id: ShortcutId): string {
    return this.bindings()[id];
  }

  isCustomized(id: ShortcutId): boolean {
    return this.prefs().bindings[id] != null;
  }

  /** Whether this shortcut currently does nothing because character keys are off. */
  isSuppressed(id: ShortcutId): boolean {
    return !this.characterKeysEnabled() && isCharacterKey(this.keyFor(id));
  }

  /** The shortcut that already uses `key` where `id` works, if any. */
  conflictFor(id: ShortcutId, key: string): ShortcutDef | null {
    const scope = SHORTCUTS.find((s) => s.id === id)!.scope;
    return (
      SHORTCUTS.find(
        (s) => s.id !== id && overlaps(s.scope, scope) && this.keyFor(s.id) === key
      ) ?? null
    );
  }

  setBinding(id: ShortcutId, key: string) {
    const def = SHORTCUTS.find((s) => s.id === id)!;
    this.update((p) => {
      const bindings = { ...p.bindings };
      if (key === def.defaultKey) delete bindings[id];
      else bindings[id] = key;
      return { ...p, bindings };
    });
  }

  resetBinding(id: ShortcutId) {
    this.setBinding(id, SHORTCUTS.find((s) => s.id === id)!.defaultKey);
  }

  resetAll() {
    this.update((p) => ({ ...p, bindings: {} }));
  }

  setCharacterKeysEnabled(enabled: boolean) {
    this.update((p) => ({ ...p, characterKeys: enabled }));
  }

  /**
   * The shortcut in `scope` that this keydown triggers, or null. Keys typed
   * into a field, Enter/Space on a button, and keys another handler already
   * took never count.
   */
  match(e: KeyboardEvent, scope: ShortcutScope): ShortcutId | null {
    if (e.defaultPrevented || isTypingTarget(e.target)) return null;
    const key = eventToKey(e);
    if (key == null || activatesOnKey(e.target, key)) return null;
    if (!this.characterKeysEnabled() && isCharacterKey(key)) return null;
    const bindings = this.bindings();
    return SHORTCUTS.find((s) => s.scope === scope && bindings[s.id] === key)?.id ?? null;
  }

  private update(fn: (p: Prefs) => Prefs) {
    this.prefs.update(fn);
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this.prefs()));
    } catch {
      // Storage full or blocked: the change still applies until reload.
    }
  }
}
