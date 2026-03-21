import { IMessagePublisher } from './IMessagePublisher';

class NoopPublisher implements IMessagePublisher {
  async publish(): Promise<void> {
    console.warn('[core-server] Publisher: no-op (Service Bus not configured)');
  }
  async close(): Promise<void> { /* no-op */ }
}

export { NoopPublisher };
