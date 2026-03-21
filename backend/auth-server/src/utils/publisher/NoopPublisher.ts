import { IMessagePublisher } from './IMessagePublisher';

class NoopPublisher implements IMessagePublisher {
  async publish(): Promise<void> {
    console.warn('[auth-server] Publisher: no-op (Service Bus not configured)');
  }
  async close(): Promise<void> {}
}

export default NoopPublisher;
