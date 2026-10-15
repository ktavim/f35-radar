// Every keyboard shortcut a user can rebind in Settings. Components never test
// for a key themselves: they ask ShortcutsService which action a keydown is.

// Where a shortcut works. 'global' anywhere in the app; 'review' on the review
// screen; 'terminal' only while the live-feed terminal has focus.
export type ShortcutScope = 'global' | 'review' | 'terminal';

export interface ShortcutDef {
  id: string;
  scope: ShortcutScope;
  label: string;
  defaultKey: string;
}

export const SHORTCUT_SCOPES: { key: ShortcutScope; label: string; hint?: string }[] = [
  { key: 'global', label: 'Anywhere' },
  { key: 'review', label: 'Review screen' },
  { key: 'terminal', label: 'Live feed terminal', hint: 'while the terminal has focus' }
];

export const SHORTCUTS = [
  { id: 'global.help', scope: 'global', label: 'Show keyboard shortcuts', defaultKey: '?' },
  { id: 'review.next', scope: 'review', label: 'Next finding', defaultKey: 'j' },
  { id: 'review.prev', scope: 'review', label: 'Previous finding', defaultKey: 'k' },
  { id: 'review.nextTab', scope: 'review', label: 'Next tab', defaultKey: ']' },
  { id: 'review.prevTab', scope: 'review', label: 'Previous tab', defaultKey: '[' },
  { id: 'review.toggleExclusion', scope: 'review', label: 'Exclude or re-include finding', defaultKey: 'x' },
  { id: 'review.open', scope: 'review', label: 'Open finding details', defaultKey: 'Enter' },
  { id: 'terminal.search', scope: 'terminal', label: 'Search the log', defaultKey: '/' },
  { id: 'terminal.latest', scope: 'terminal', label: 'Jump to latest', defaultKey: 'End' },
  { id: 'terminal.top', scope: 'terminal', label: 'Jump to top', defaultKey: 'Home' }
] as const satisfies readonly ShortcutDef[];

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

// Keys that mean the same thing across the web and stay fixed: rebinding them
// would break how keyboard and screen reader users get around.
export const FIXED_KEYS: { keys: string[]; label: string }[] = [
  { keys: ['Escape'], label: 'Close the detail panel, search or dialog' },
  { keys: ['Tab'], label: 'Move focus' },
  { keys: ['ArrowLeft', 'ArrowRight'], label: 'Move between tabs when a tab has focus' }
];
