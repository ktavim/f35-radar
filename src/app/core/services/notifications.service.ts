import { Injectable, computed, inject, signal } from '@angular/core';
import { SseService } from '@lib/sse.service';
import type { ScanEvent } from '@core/models';

export interface NotificationItem {
  id: string;
  scan_id?: string;
  title: string;
  body: string;
  created_at: number;
  read: boolean;
}

/**
 * Root-level notifications service. Lives for the lifetime of the app, not
 * the route, so notifications persist across navigations.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly sse = inject(SseService);

  private readonly _items = signal<NotificationItem[]>([]);
  readonly items = this._items.asReadonly();
  readonly unreadCount = computed(() => this._items().filter((n) => !n.read).length);

  private connection: ReturnType<SseService['open']> | null = null;

  start(apiBase: string) {
    if (this.connection) return;
    this.connection = this.sse.open(`${apiBase}/notifications`);
    this.connection.events$.subscribe({
      next: (evt) => this.onEvent(evt),
      error: () => {/* SSE auto-reconnects; no-op */}
    });
  }

  stop() {
    this.connection?.close();
    this.connection = null;
  }

  markAllRead() {
    this._items.update((list) => list.map((n) => ({ ...n, read: true })));
  }

  push(item: Omit<NotificationItem, 'id' | 'created_at' | 'read'>) {
    this._items.update((list) => [
      { id: crypto.randomUUID(), created_at: Date.now(), read: false, ...item },
      ...list
    ]);
  }

  private onEvent(evt: ScanEvent) {
    if (evt.type === 'scan_completed') {
      // A partial scan also ends in scan_completed, flagged in the payload: a
      // scanner's results are missing, so it can't be submitted and the fix is
      // to rerun it. Say so rather than announcing a plain completion.
      if (evt.payload['partial'] === true) {
        const failed = Array.isArray(evt.payload['failed_scanners'])
          ? (evt.payload['failed_scanners'] as unknown[]).map(String)
          : [];
        this.push({
          scan_id: evt.scan_id,
          title: 'Scan partially completed',
          body: `Scan ${evt.scan_id} finished without the ${failed.length ? failed.join(' and ') : 'failed scanner'}'s results. Rerun it to submit.`
        });
        return;
      }
      this.push({
        scan_id: evt.scan_id,
        title: 'Scan completed',
        body: `Scan ${evt.scan_id} finished`
      });
    } else if (evt.type === 'scan_failed') {
      this.push({
        scan_id: evt.scan_id,
        title: 'Scan failed',
        body: `Scan ${evt.scan_id} failed`
      });
    }
  }
}
