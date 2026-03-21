import { IMessageSubscriber } from './IMessageSubscriber';

class NoopSubscriber implements IMessageSubscriber {
  async start(): Promise<void> {
    console.log('[ai-server] Subscriber: no-op (Service Bus not configured)');
  }
  async stop(): Promise<void> {}
}

export { NoopSubscriber };
