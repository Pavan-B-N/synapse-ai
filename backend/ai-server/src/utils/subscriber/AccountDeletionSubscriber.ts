import { ServiceBusClient, ServiceBusReceivedMessage, ProcessErrorArgs } from '@azure/service-bus';
import Document from '../../models/Document';
import QueryHistory from '../../models/QueryHistory';
import { vectorStore } from '../container';
import { IMessageSubscriber } from './IMessageSubscriber';

class AccountDeletionSubscriber implements IMessageSubscriber {
  private client: ServiceBusClient;
  private receiver: ReturnType<ServiceBusClient['createReceiver']> | null = null;

  constructor(connectionString: string) {
    this.client = new ServiceBusClient(connectionString);
  }

  async start(): Promise<void> {
    this.receiver = this.client.createReceiver('account-deleted', 'ai-cleanup');

    this.receiver.subscribe({
      processMessage: async (message: ServiceBusReceivedMessage) => {
        await this.handleMessage(message);
      },
      processError: async (args: ProcessErrorArgs) => {
        console.error(`[ai-server] Account deletion subscriber error (${args.errorSource}):`, args.error.message);
      },
    });

    console.log('[ai-server] Account deletion subscriber started: account-deleted/ai-cleanup');
  }

  private async handleMessage(message: ServiceBusReceivedMessage): Promise<void> {
    const body = message.body as Record<string, unknown>;
    const userId = body.userId as string;
    if (!userId) {
      console.warn('[ai-server] Account deletion message missing userId, skipping');
      return;
    }

    console.log(`[ai-server] Processing account deletion for user ${userId}`);

    // Collect document IDs for vector cleanup
    const docs = await Document.find({ userId }).select('_id').lean();

    await Promise.all([
      // Delete query histories
      QueryHistory.deleteMany({ userId }),
      // Delete AI document records
      Document.deleteMany({ userId }),
      // Delete vector embeddings for each document
      ...docs.map(d => vectorStore.deleteByDocument(d._id.toString())),
    ]);

    console.log(`[ai-server] Account deletion cleanup complete for user ${userId} (${docs.length} documents, query histories removed)`);
  }

  async stop(): Promise<void> {
    if (this.receiver) await this.receiver.close();
    await this.client.close();
  }
}

export { AccountDeletionSubscriber };
