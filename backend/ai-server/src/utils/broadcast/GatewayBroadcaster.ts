/**
 * GatewayBroadcaster — Sends real-time events to the API gateway via Socket.IO.
 * The gateway relays them to browser clients in the appropriate rooms.
 */
import { io as ioClient, Socket } from 'socket.io-client';

const GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:5001';

/**
 * GatewayBroadcaster — OOP wrapper for broadcasting events to the API gateway.
 * Manages Socket.IO client connection lifecycle and event emission.
 */
class GatewayBroadcaster {
  private socket: Socket | null = null;
  private gatewayUrl: string;

  constructor(gatewayUrl: string) {
    this.gatewayUrl = gatewayUrl;
  }

  /** Returns or creates the Socket.IO client connection */
  private getSocket(): Socket {
    if (!this.socket) {
      this.socket = ioClient(this.gatewayUrl, {
        path: '/ws',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
      });
      this.socket.on('connect', () => {
        console.log('[ai-server] Connected to gateway socket');
      });
      this.socket.on('connect_error', (err) => {
        console.error('[ai-server] Gateway socket error:', err.message);
      });
    }
    return this.socket;
  }

  /** Emits an event to a specific room, connecting if necessary */
  private emitToRoom(room: string, event: string, data: Record<string, any>): void {
    const s = this.getSocket();
    const emit = () => {
      s.emit('internal:broadcast', { room, event, data });
    };
    if (s.connected) {
      emit();
    } else {
      s.once('connect', emit);
      if (s.disconnected) s.connect();
    }
  }

  /** Broadcasts document processing status to user and document rooms */
  broadcastDocumentStatus(documentId: string, userId: string, data: Record<string, any>): void {
    const payload = { documentId, ...data };
    this.emitToRoom(`user:${userId}`, 'doc:status', payload);
    this.emitToRoom(`doc:${documentId}`, 'doc:status', payload);
  }

  /** Broadcasts an event to a specific user */
  broadcastToUser(userId: string, event: string, data: Record<string, any>): void {
    this.emitToRoom(`user:${userId}`, event, data);
  }

  /** Broadcasts an event to any room */
  broadcastToRoom(room: string, event: string, data: Record<string, any>): void {
    this.emitToRoom(room, event, data);
  }

  /** Eagerly connects the socket */
  connect(): void {
    this.getSocket();
  }
}

// Singleton instance
const broadcaster = new GatewayBroadcaster(GATEWAY_URL);
broadcaster.connect();

// Named exports for backward compatibility
export const broadcastDocStatus = (documentId: string, userId: string, data: Record<string, any>) =>
  broadcaster.broadcastDocumentStatus(documentId, userId, data);
export const broadcastToUser = (userId: string, event: string, data: Record<string, any>) =>
  broadcaster.broadcastToUser(userId, event, data);
export const broadcastToRoom = (room: string, event: string, data: Record<string, any>) =>
  broadcaster.broadcastToRoom(room, event, data);

export default broadcaster;
