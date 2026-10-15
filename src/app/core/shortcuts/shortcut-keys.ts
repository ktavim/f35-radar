// A key binding as it is stored and compared: modifiers in a fixed order, then
// the key, joined by '+'. For example 'j', '?', 'End', 'Shift+j', 'Ctrl+Alt+k'.
//
// Letters are stored lowercase with an explicit Shift, so Caps Lock does not
// change what a key means. Other printed characters already carry Shift in
// them ('?' is Shift+/ on most layouts), so Shift is not recorded for those.

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
type Modifier = (typeof MODIFIERS)[number];

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'AltGraph', 'Shift', 'Meta', 'OS', 'CapsLock', 'Fn']);

const LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  Delete: 'Del'
};

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** The binding a keydown event spells, or null for a bare modifier or a dead key. */
export function eventToKey(e: KeyboardEvent): string | null {
  if (e.isComposing || MODIFIER_KEYS.has(e.key) || e.key === 'Dead' || e.key === 'Unidentified') {
    return null;
  }
  let key = e.key === ' ' ? 'Space' : e.key;
  // On a non-Latin layout (Hebrew, Russian…) the J key prints another letter.
  // Fall back to the key's position so shortcuts work whichever layout is on.
  if (key.length === 1 && !/^[\x20-\x7e]$/.test(key) && /^Key[A-Z]$/.test(e.code ?? '')) {
    key = e.code.slice(3);
  }
  let shift = e.shiftKey;
  if (key.length === 1) {
    if (key.toLowerCase() !== key.toUpperCase()) key = key.toLowerCase();
    else shift = false;
  }
  const mods: Modifier[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (shift) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  return [...mods, key].join('+');
}

/** Splits a binding into its modifiers and key. The key may itself be '+'. */
export function splitKey(binding: string): { mods: Modifier[]; key: string } {
  const mods: Modifier[] = [];
  let rest = binding;
  for (const m of MODIFIERS) {
    if (rest.startsWith(m + '+') && rest.length > m.length + 1) {
      mods.push(m);
      rest = rest.slice(m.length + 1);
    }
  }
  return { mods, key: rest };
}

/**
 * A shortcut made of one printed character with no Ctrl, Alt or Meta, like
 * 'j' or '?'. These are the ones WCAG 2.1.4 says a user must be able to turn
 * off, since speech input and stray keypresses can fire them by accident.
 */
export function isCharacterKey(binding: string): boolean {
  const { mods, key } = splitKey(binding);
  return key.length === 1 && mods.every((m) => m === 'Shift');
}

/** The labels to show for a binding, one per key: ['Ctrl', 'K']. */
export function keyLabels(binding: string): string[] {
  const { mods, key } = splitKey(binding);
  const modLabels = mods.map((m) => (m === 'Meta' ? (IS_MAC ? '⌘' : 'Win') : m));
  return [...modLabels, LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key)];
}

/** A binding as plain text, for messages: 'Ctrl+K'. */
export function describeKey(binding: string): string {
  return keyLabels(binding).join('+');
}

/** True while the user is typing into a field, where keys must go to the field. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

/** True when Enter or Space on this element already activates it. */
export function activatesOnKey(target: EventTarget | null, binding: string): boolean {
  if (binding !== 'Enter' && binding !== 'Space') return false;
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      'button, a[href], summary, [role="button"], [role="tab"], [role="link"], [role="menuitem"], [role="option"]'
    ) != null
  );
}
