import { ServiceBusClient, ServiceBusReceivedMessage, ProcessErrorArgs } from '@azure/service-bus';
import config from '../../config';
import Notification from '../../models/Notification';
import { broadcaster } from '../broadcast';
import { IMessageSubscriber } from './IMessageSubscriber';

class NotificationSubscriber implements IMessageSubscriber {
  private client: ServiceBusClient;
  private receiver: ReturnType<ServiceBusClient['createReceiver']> | null = null;

  constructor(connectionString: string) {
    this.client = new ServiceBusClient(connectionString);
  }

  async start(): Promise<void> {
    this.receiver = this.client.createReceiver('notifications', 'push-delivery');

    this.receiver.subscribe({
      processMessage: async (message: ServiceBusReceivedMessage) => {
        await this.handleMessage(message);
      },
      processError: async (args: ProcessErrorArgs) => {
        console.error(`[core-server] Notification subscriber error (${args.errorSource}):`, args.error.message);
      },
    });

    console.log('[core-server] Notification subscriber started: notifications/push-delivery');
  }

  private async handleMessage(message: ServiceBusReceivedMessage): Promise<void> {
    const body = message.body as Record<string, unknown>;
    const { userId, type, title, messageText, metadata } = body;

    if (!userId || !type || !title) {
      console.warn('[core-server] Notification message missing required fields, skipping');
      return;
    }

    // Persist notification
    const notification = await Notification.create({
      userId,
      type,
      title,
      message: messageText || '',
      metadata: metadata || {},
    });

    // Broadcast to user in real-time via gateway
    broadcaster.emit(`user:${userId}`, 'notification', {
      _id: notification._id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata,
      read: false,
      createdAt: notification.createdAt,
    });
  }

  async stop(): Promise<void> {
    if (this.receiver) await this.receiver.close();
    await this.client.close();
    console.log('[core-server] Notification subscriber stopped');
  }
}

export { NotificationSubscriber };
