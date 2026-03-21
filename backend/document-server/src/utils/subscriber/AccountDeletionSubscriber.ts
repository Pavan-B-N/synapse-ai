import { ServiceBusClient, ServiceBusReceivedMessage, ProcessErrorArgs } from '@azure/service-bus';
import config from '../../config';
import mongoose from 'mongoose';
import Document from '../../models/Document';
import DocumentContent from '../../models/DocumentContent';
import DocumentSummary from '../../models/DocumentSummary';
import fs from 'fs';
import { IMessageSubscriber } from './IMessageSubscriber';

class AccountDeletionSubscriber implements IMessageSubscriber {
  private client: ServiceBusClient;
  private receiver: ReturnType<ServiceBusClient['createReceiver']> | null = null;

  constructor(connectionString: string) {
    this.client = new ServiceBusClient(connectionString);
  }

  async start(): Promise<void> {
    this.receiver = this.client.createReceiver('account-deleted', 'document-cleanup');

    this.receiver.subscribe({
      processMessage: async (message: ServiceBusReceivedMessage) => {
        await this.handleMessage(message);
      },
      processError: async (args: ProcessErrorArgs) => {
        console.error(`[document-server] Account deletion subscriber error (${args.errorSource}):`, args.error.message);
      },
    });

    console.log('[document-server] Account deletion subscriber started: account-deleted/document-cleanup');
  }

  private async handleMessage(message: ServiceBusReceivedMessage): Promise<void> {
    const body = message.body as Record<string, unknown>;
    const userId = body.userId as string;
    if (!userId) {
      console.warn('[document-server] Account deletion message missing userId, skipping');
      return;
    }

    console.log(`[document-server] Processing account deletion for user ${userId}`);

    // Collect documents for file cleanup and chunk/summary deletion
    const docs = await Document.find({ userId }).select('_id filePath').lean();
    const docIds = docs.map(d => d._id);

    await Promise.all([
      // Delete document records
      Document.deleteMany({ userId }),
      // Remove user from sharedWith on other users' documents
      Document.updateMany(
        { sharedWith: new mongoose.Types.ObjectId(userId) },
        { $pull: { sharedWith: new mongoose.Types.ObjectId(userId) } as any }
      ),
      // Delete content chunks for user's documents
      ...(docIds.length > 0 ? [
        DocumentContent.deleteMany({ documentId: { $in: docIds } }),
        DocumentSummary.deleteMany({ documentId: { $in: docIds } }),
      ] : []),
    ]);

    // Clean up physical files (best-effort)
    for (const doc of docs) {
      try {
        if ((doc as any).filePath && fs.existsSync((doc as any).filePath)) {
          fs.unlinkSync((doc as any).filePath);
        }
      } catch { /* ignore file cleanup errors */ }
    }

    console.log(`[document-server] Account deletion cleanup complete for user ${userId} (${docs.length} documents removed)`);
  }

  async stop(): Promise<void> {
    if (this.receiver) await this.receiver.close();
    await this.client.close();
  }
}

export { AccountDeletionSubscriber };
