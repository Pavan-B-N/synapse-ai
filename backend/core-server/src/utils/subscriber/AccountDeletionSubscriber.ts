import { ServiceBusClient, ServiceBusReceivedMessage, ProcessErrorArgs } from '@azure/service-bus';
import config from '../../config';
import mongoose from 'mongoose';
import { IMessageSubscriber } from './IMessageSubscriber';

class AccountDeletionSubscriber implements IMessageSubscriber {
  private client: ServiceBusClient;
  private receiver: ReturnType<ServiceBusClient['createReceiver']> | null = null;

  constructor(connectionString: string) {
    this.client = new ServiceBusClient(connectionString);
  }

  async start(): Promise<void> {
    this.receiver = this.client.createReceiver('account-deleted', 'core-cleanup');

    this.receiver.subscribe({
      processMessage: async (message: ServiceBusReceivedMessage) => {
        await this.handleMessage(message);
      },
      processError: async (args: ProcessErrorArgs) => {
        console.error(`[core-server] Account deletion subscriber error (${args.errorSource}):`, args.error.message);
      },
    });

    console.log('[core-server] Account deletion subscriber started: account-deleted/core-cleanup');
  }

  private async handleMessage(message: ServiceBusReceivedMessage): Promise<void> {
    const body = message.body as Record<string, unknown>;
    const userId = body.userId as string;
    if (!userId) {
      console.warn('[core-server] Account deletion message missing userId, skipping');
      return;
    }

    console.log(`[core-server] Processing account deletion for user ${userId}`);
    const oid = new mongoose.Types.ObjectId(userId);
    const db = mongoose.connection.db;
    if (!db) {
      console.error('[core-server] Account deletion failed: no database connection');
      return;
    }

    // Collect owned resources for cascading cleanup
    const [ownedChannels, ownedGroups] = await Promise.all([
      db.collection('channels').find({ adminId: oid }, { projection: { _id: 1 } }).toArray(),
      db.collection('docgroups').find({ userId: oid }, { projection: { _id: 1 } }).toArray(),
    ]);
    const ownedChannelIds = ownedChannels.map(c => c._id);
    const ownedGroupIds = ownedGroups.map(g => g._id);

    await Promise.all([
      // Channels owned → delete entirely (including posts)
      ...(ownedChannelIds.length > 0 ? [
        db.collection('channels').deleteMany({ adminId: oid }),
        db.collection('channelposts').deleteMany({ channelId: { $in: ownedChannelIds } }),
      ] : []),

      // Remove from channels where user is member/requester
      db.collection('channels').updateMany(
        { 'members.userId': oid },
        { $pull: { members: { userId: oid } } as any, $inc: { memberCount: -1 } }
      ),
      db.collection('channels').updateMany(
        { 'joinRequests.userId': oid },
        { $pull: { joinRequests: { userId: oid } } as any }
      ),

      // Posts by user in channels they don't own
      db.collection('channelposts').deleteMany({
        authorId: oid,
        ...(ownedChannelIds.length > 0 ? { channelId: { $nin: ownedChannelIds } } : {}),
      }),
      // Remove likes/dislikes/comments
      db.collection('channelposts').updateMany(
        { $or: [{ likes: oid }, { dislikes: oid }] },
        { $pull: { likes: oid, dislikes: oid } as any }
      ),
      db.collection('channelposts').updateMany(
        { 'comments.userId': oid },
        { $pull: { comments: { userId: oid } } as any }
      ),

      // Notifications
      db.collection('notifications').deleteMany({ userId: oid }),

      // Quizzes
      db.collection('quizzes').deleteMany({ userId: oid }),

      // Workspace messages
      db.collection('workspacemessages').deleteMany({ userId: oid }),
      ...(ownedGroupIds.length > 0 ? [
        db.collection('workspacemessages').deleteMany({ workspaceId: { $in: ownedGroupIds } }),
      ] : []),

      // Doc groups (workspaces)
      db.collection('docgroups').deleteMany({ userId: oid }),
      db.collection('docgroups').updateMany(
        { 'members.userId': oid },
        { $pull: { members: { userId: oid } } as any }
      ),
      ...(ownedGroupIds.length > 0 ? [
        db.collection('channels').updateMany(
          { attachedWorkspaces: { $in: ownedGroupIds } },
          { $pull: { attachedWorkspaces: { $in: ownedGroupIds } } as any }
        ),
      ] : []),
    ]);

    console.log(`[core-server] Account deletion cleanup complete for user ${userId}`);
  }

  async stop(): Promise<void> {
    if (this.receiver) await this.receiver.close();
    await this.client.close();
  }
}

export { AccountDeletionSubscriber };
