import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService, type CurrentUser } from '@core/services/auth.service';
import { ShortcutsService } from './shortcuts.service';
import { eventToKey, isCharacterKey, keyLabels, splitKey } from './shortcut-keys';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('eventToKey', () => {
  it('spells plain keys, named keys and combinations', () => {
    expect(eventToKey(key({ key: 'j' }))).toBe('j');
    expect(eventToKey(key({ key: 'End' }))).toBe('End');
    expect(eventToKey(key({ key: ' ' }))).toBe('Space');
    expect(eventToKey(key({ key: 'k', ctrlKey: true }))).toBe('Ctrl+k');
    expect(eventToKey(key({ key: 'End', shiftKey: true }))).toBe('Shift+End');
  });

  it('records Shift for letters but not for symbols that already include it', () => {
    expect(eventToKey(key({ key: 'J', shiftKey: true }))).toBe('Shift+j');
    expect(eventToKey(key({ key: '?', shiftKey: true }))).toBe('?');
  });

  it('ignores Caps Lock', () => {
    expect(eventToKey(key({ key: 'J' }))).toBe('j');
  });

  it('falls back to the key position on a non-Latin layout', () => {
    // The J key with a Hebrew layout on prints ח.
    expect(eventToKey(key({ key: 'ח', code: 'KeyJ' }))).toBe('j');
  });

  it('returns null for a bare modifier', () => {
    expect(eventToKey(key({ key: 'Control', ctrlKey: true }))).toBeNull();
  });
});

describe('key helpers', () => {
  it('splits a binding whose key is +', () => {
    expect(splitKey('Ctrl++')).toEqual({ mods: ['Ctrl'], key: '+' });
    expect(splitKey('+')).toEqual({ mods: [], key: '+' });
  });

  it('labels keys for display', () => {
    expect(keyLabels('Ctrl+Shift+k')).toEqual(['Ctrl', 'Shift', 'K']);
    expect(keyLabels('ArrowUp')).toEqual(['↑']);
  });

  it('treats only modifier-free printed characters as character keys', () => {
    expect(isCharacterKey('j')).toBe(true);
    expect(isCharacterKey('Shift+j')).toBe(true);
    expect(isCharacterKey('Alt+j')).toBe(false);
    expect(isCharacterKey('Enter')).toBe(false);
  });
});

describe('ShortcutsService', () => {
  const user = signal<CurrentUser | null>({ username: 'alice', display_name: 'Alice', email: '' });

  function service() {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUser: user } }]
    });
    return TestBed.inject(ShortcutsService);
  }

  beforeEach(() => {
    localStorage.clear();
    user.set({ username: 'alice', display_name: 'Alice', email: '' });
  });
  afterEach(() => localStorage.clear());

  it('matches default bindings in their own scope only', () => {
    const s = service();
    expect(s.match(key({ key: 'j' }), 'review')).toBe('review.next');
    expect(s.match(key({ key: 'j' }), 'terminal')).toBeNull();
  });

  it('does not fire a plain-key shortcut for Ctrl+key', () => {
    const s = service();
    expect(s.match(key({ key: 'k', ctrlKey: true }), 'review')).toBeNull();
  });

  it('ignores keys typed into a field', () => {
    const s = service();
    const select = document.createElement('select');
    document.body.append(select);
    const e = key({ key: 'j', bubbles: true });
    let action: string | null = 'unset';
    select.addEventListener('keydown', (ev) => (action = s.match(ev, 'review')));
    select.dispatchEvent(e);
    select.remove();
    expect(action).toBeNull();
  });

  it('leaves Enter to a focused button', () => {
    const s = service();
    const button = document.createElement('button');
    document.body.append(button);
    let action: string | null = 'unset';
    button.addEventListener('keydown', (ev) => (action = s.match(ev, 'review')));
    button.dispatchEvent(key({ key: 'Enter', bubbles: true }));
    button.remove();
    expect(action).toBeNull();
  });

  it('uses a custom binding instead of the default and saves it per user', () => {
    const s = service();
    s.setBinding('review.next', 'Alt+n');
    expect(s.match(key({ key: 'n', altKey: true }), 'review')).toBe('review.next');
    expect(s.match(key({ key: 'j' }), 'review')).toBeNull();
    expect(JSON.parse(localStorage.getItem('eg.shortcuts.alice')!).bindings).toEqual({
      'review.next': 'Alt+n'
    });
  });

  it('loads the signed-in user’s own bindings', () => {
    localStorage.setItem(
      'eg.shortcuts.bob',
      JSON.stringify({ bindings: { 'review.next': 'n' }, characterKeys: true })
    );
    const s = service();
    expect(s.keyFor('review.next')).toBe('j');
    user.set({ username: 'bob', display_name: 'Bob', email: '' });
    expect(s.keyFor('review.next')).toBe('n');
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('eg.shortcuts.alice', '{not json');
    expect(service().keyFor('review.next')).toBe('j');
  });

  it('forgets an override set back to the default', () => {
    const s = service();
    s.setBinding('review.next', 'n');
    s.setBinding('review.next', 'j');
    expect(s.isCustomized('review.next')).toBe(false);
    expect(s.anyCustomized()).toBe(false);
  });

  it('finds clashes in the same scope and with global shortcuts', () => {
    const s = service();
    expect(s.conflictFor('review.next', 'k')?.id).toBe('review.prev');
    expect(s.conflictFor('review.next', '?')?.id).toBe('global.help');
    // The focused terminal handles its keys first, so these may overlap.
    expect(s.conflictFor('review.next', '/')).toBeNull();
  });

  it('turns off single-character shortcuts but keeps the rest', () => {
    const s = service();
    s.setCharacterKeysEnabled(false);
    expect(s.match(key({ key: 'j' }), 'review')).toBeNull();
    expect(s.match(key({ key: 'End' }), 'terminal')).toBe('terminal.latest');
    s.setBinding('review.next', 'Alt+j');
    expect(s.match(key({ key: 'j', altKey: true }), 'review')).toBe('review.next');
  });
});
