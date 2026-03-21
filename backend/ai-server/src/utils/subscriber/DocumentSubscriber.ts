import { ServiceBusClient, ServiceBusReceivedMessage, ProcessErrorArgs } from '@azure/service-bus';
import { processDocument, deleteVectors } from '../../workers/documentProcessor';
import Document from '../../models/Document';
import { IMessageSubscriber } from './IMessageSubscriber';

class DocumentSubscriber implements IMessageSubscriber {
  private client: ServiceBusClient;
  private topicName: string;
  private subscriptionName: string;
  private receiver: ReturnType<ServiceBusClient['createReceiver']> | null = null;

  constructor(connectionString: string, topicName: string, subscriptionName: string) {
    this.client = new ServiceBusClient(connectionString);
    this.topicName = topicName;
    this.subscriptionName = subscriptionName;
  }

  async start(): Promise<void> {
    this.receiver = this.client.createReceiver(this.topicName, this.subscriptionName);

    this.receiver.subscribe({
      processMessage: async (message: ServiceBusReceivedMessage) => {
        await this.handleMessage(message);
      },
      processError: async (args: ProcessErrorArgs) => {
        console.error(`[ai-server] Subscriber error (${args.errorSource}):`, args.error.message);
      },
    });

    console.log(`[ai-server] Subscriber started: ${this.topicName}/${this.subscriptionName}`);
  }

  private async handleMessage(message: ServiceBusReceivedMessage): Promise<void> {
    const label = message.subject || '';
    const body = message.body as Record<string, unknown>;
    const documentId = body.documentId as string;

    if (!documentId) {
      console.warn('[ai-server] Subscriber: message missing documentId, skipping');
      return;
    }

    console.log(`[ai-server] Processing event: ${label} for document ${documentId}`);

    switch (label) {
      case 'document.uploaded': {
        // Idempotency: skip if already processed
        const doc = await Document.findById(documentId);
        if (doc && (doc as any).status === 'ready') {
          console.log(`[ai-server] Document ${documentId} already processed, skipping`);
          return;
        }
        await processDocument(documentId);
        break;
      }
      case 'document.delete-vectors': {
        await deleteVectors(documentId);
        break;
      }
      default:
        console.warn(`[ai-server] Unknown event label: ${label}`);
    }
  }

  async stop(): Promise<void> {
    if (this.receiver) await this.receiver.close();
    await this.client.close();
    console.log('[ai-server] Subscriber stopped');
  }
}

export { DocumentSubscriber };
