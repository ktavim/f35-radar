import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
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
 * Styled dropdown for manually classifying a service whose auth method the
 * scanners could not tell, or whose negotiate mechanism they could not name.
 * The options come from `manualAuthTargets`. Mirrors the colour coding of
 * <app-auth-pill>.
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
        <span>{{ label() }}</span>
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
          @for (opt of options(); track opt.value) {
            <li>
              <button
                type="button"
                role="option"
                [attr.aria-selected]="opt.value === current()"
                class="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-fg hover:bg-surface-2 transition-colors text-left"
                (click)="choose(opt.value)">
                <span class="sev-dot" [style.background]="opt.color"></span>
                <span class="flex-1">{{ opt.label }}</span>
                @if (opt.value === current()) {
                  <lucide-icon [name]="icons.Check" [size]="12" class="text-fg-muted"></lucide-icon>
                }
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

  readonly methods = input.required<readonly AuthMethod[]>();
  // The service's method now, checked in the list; a manual one among them.
  readonly current = input<AuthMethod | null>(null);
  readonly label = input<string>('Set auth method…');
  readonly methodSelected = output<AuthMethod>();
  readonly open = signal(false);

  readonly options = computed<AuthOption[]>(() =>
    this.methods().map((value) => ({
      value,
      label: authMethodLabel(value),
      color: authMethodColor(value)
    }))
  );

  toggle() {
    this.open.update((v) => !v);
  }

  choose(method: AuthMethod) {
    this.open.set(false);
    if (method !== this.current()) this.methodSelected.emit(method);
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
