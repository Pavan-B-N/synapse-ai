import { IMessageSubscriber } from './IMessageSubscriber';

class NoopSubscriber implements IMessageSubscriber {
  async start(): Promise<void> {
    console.warn('[document-server] Account deletion subscriber: no-op (Service Bus not configured)');
  }
  async stop(): Promise<void> {}
}

export { NoopSubscriber };
