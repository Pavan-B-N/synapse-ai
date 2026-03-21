import { io as SocketIOClient, Socket } from 'socket.io-client';
import config from '../../config';
import { IBroadcaster } from './IBroadcaster';

class SocketIOBroadcaster implements IBroadcaster {
  private socket: Socket | null = null;

  connect(): void {
    if (this.socket?.connected) return;

    this.socket = SocketIOClient(config.gateway.url, {
      path: '/ws',
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      console.log('[core-server] Connected to gateway Socket.IO');
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[core-server] Gateway Socket.IO connect error:', err.message);
    });
  }

  emit(room: string, event: string, data: unknown): void {
    if (!this.socket?.connected) {
      console.warn('[core-server] Socket not connected, cannot broadcast');
      return;
    }
    this.socket.emit('internal:broadcast', { room, event, data });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export { SocketIOBroadcaster };
