import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import RedisConnectionManager from '../redis/RedisConnectionManager';

class SocketManager {
  private io: SocketIOServer;
  private redisManager: RedisConnectionManager;

  constructor(server: http.Server) {
    this.io = new SocketIOServer(server, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
      path: '/ws',
    });
    this.redisManager = RedisConnectionManager.getInstance();
  }

  async attachRedisAdapter(): Promise<void> {
    if (!await this.redisManager.isConnected()) {
      console.log('[gateway] Socket.IO: in-memory adapter (no Redis)');
      return;
    }

    const pubClient = this.redisManager.getPublisherClient();
    const subClient = this.redisManager.getSubscriberClient();
    if (!pubClient || !subClient) return;

    try {
      this.io.adapter(createAdapter(pubClient, subClient));
      console.log('[gateway] Socket.IO: Redis adapter attached');
    } catch (err: any) {
      console.warn('[gateway] Socket.IO: Redis adapter failed, using in-memory:', err.message);
    }
  }

  registerHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[gateway] Socket connected: ${socket.id}`);

      socket.on('join', (room: string) => this.handleJoin(socket, room));
      socket.on('set-name', (name: string) => this.handleSetName(socket, name));
      socket.on('leave', (room: string) => this.handleLeave(socket, room));
      socket.on('internal:broadcast', (payload: { room: string; event: string; data: unknown }) => {
        this.handleInternalBroadcast(payload);
      });
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  getIO(): SocketIOServer {
    return this.io;
  }

  private handleJoin(socket: Socket, room: string): void {
    socket.join(room);
    console.log(`[gateway] Socket ${socket.id} joined room: ${room}`);

    if (room.startsWith('user:')) {
      for (const r of socket.rooms) {
        if (r.startsWith('workspace:')) {
          this.broadcastWorkspacePresence(r);
        }
      }
    }

    if (room.startsWith('workspace:')) {
      setTimeout(() => this.broadcastWorkspacePresence(room), 150);
    }
  }

  private handleSetName(socket: Socket, name: string): void {
    (socket as any).data = { ...(socket as any).data, userName: name };
  }

  private handleLeave(socket: Socket, room: string): void {
    socket.leave(room);
    if (room.startsWith('workspace:')) {
      setTimeout(() => this.broadcastWorkspacePresence(room), 100);
    }
  }

  private handleInternalBroadcast(payload: { room: string; event: string; data: unknown }): void {
    if (payload?.room && payload?.event) {
      console.log(`[gateway] Broadcasting ${payload.event} to room ${payload.room}`);
      this.io.to(payload.room).emit(payload.event, payload.data);
    }
  }

  private handleDisconnect(socket: Socket): void {
    console.log(`[gateway] Socket disconnected: ${socket.id}`);
    for (const room of socket.rooms) {
      if (room.startsWith('workspace:')) {
        setTimeout(() => this.broadcastWorkspacePresence(room), 100);
      }
    }
  }

  private async broadcastWorkspacePresence(room: string): Promise<void> {
    try {
      const sockets = await this.io.in(room).fetchSockets();
      const onlineUsers: { userId: string; userName?: string }[] = [];
      const seen = new Set<string>();

      for (const s of sockets) {
        for (const r of s.rooms) {
          if (r.startsWith('user:')) {
            const uid = r.replace('user:', '');
            if (!seen.has(uid)) {
              seen.add(uid);
              onlineUsers.push({ userId: uid, userName: (s as any).data?.userName });
            }
          }
        }
      }

      this.io.to(room).emit('workspace:presence', {
        workspaceId: room.replace('workspace:', ''),
        onlineUsers,
      });
    } catch (err: any) {
      console.warn('[gateway] Failed to broadcast presence:', err.message);
    }
  }
}

export default SocketManager;
