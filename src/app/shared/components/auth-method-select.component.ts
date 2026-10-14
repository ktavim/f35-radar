import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  output,
  signal
} from '@angular/core';
import { Check, ChevronDown, LucideAngularModule } from 'lucide-angular';
import { authMethodColor, authMethodLabel } from '@lib/verdict';
import type { AuthMethod } from '@core/models';

interface AuthOption {
  value: AuthMethod;
  label: string;
  color: string;
}

/**
 * The methods a person can assert by hand: every concrete scheme in the
 * backend's vocabulary. The unresolved answers (unknown, no_response,
 * dns_failed) are the states being corrected, so they are never options, and
 * negotiate is left out because it is itself unresolved SPNEGO: the person
 * picks the mechanism, Kerberos or NTLM, instead.
 */
const SELECTABLE_METHODS: readonly AuthMethod[] = [
  'ntlm',
  'kerberos',
  'oauth',
  'login_redirect',
  'bearer',
  'api_key',
  'basic',
  'other',
  'unauthenticated'
];

/**
 * Styled dropdown for manually classifying a service whose auth method the
 * scanners could not tell. Mirrors the colour coding of <app-auth-pill>.
 */
@Component({
  selector: 'app-auth-method-select',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative inline-block text-left">
      <button
        type="button"
        class="inline-flex items-center gap-2 px-2.5 py-1 rounded-sm text-xs font-mono border border-border bg-surface hover:bg-surface-2 transition-colors"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        (click)="toggle()">
        <span>Set auth method…</span>
        <lucide-icon
          [name]="icons.ChevronDown"
          [size]="14"
          class="text-fg-muted transition-transform"
          [class.rotate-180]="open()"></lucide-icon>
      </button>

      @if (open()) {
        <ul
          class="absolute left-0 z-50 mt-1 min-w-[180px] max-h-72 overflow-y-auto thin-scroll rounded-md border border-border bg-surface shadow-2xl py-1"
          role="listbox">
          @for (opt of options; track opt.value) {
            <li>
              <button
                type="button"
                role="option"
                [attr.aria-selected]="false"
                class="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-fg hover:bg-surface-2 transition-colors text-left"
                (click)="choose(opt.value)">
                <span class="sev-dot" [style.background]="opt.color"></span>
                <span>{{ opt.label }}</span>
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `
})
export class AuthMethodSelectComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly icons = { ChevronDown, Check };

  readonly methodSelected = output<AuthMethod>();
  readonly open = signal(false);

  readonly options: AuthOption[] = SELECTABLE_METHODS.map((value) => ({
    value,
    label: authMethodLabel(value),
    color: authMethodColor(value)
  }));

  toggle() {
    this.open.update((v) => !v);
  }

  choose(method: AuthMethod) {
    this.open.set(false);
    this.methodSelected.emit(method);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent) {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.open()) this.open.set(false);
  }
}
