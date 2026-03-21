import { IBroadcaster } from './IBroadcaster';

class NoopBroadcaster implements IBroadcaster {
  emit(): void { /* no-op */ }
  connect(): void { console.log('[core-server] Broadcaster: no-op'); }
  disconnect(): void { /* no-op */ }
}

export { NoopBroadcaster };
