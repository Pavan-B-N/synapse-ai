import mongoose from 'mongoose';
import { io as ioClient, Socket } from 'socket.io-client';
import Document from '../../models/Document';

/**
 * ChangeStreamService — manages CDC (Change Data Capture) via MongoDB Change Streams
 * and broadcasts real-time document status updates through Socket.IO and SSE.
 */
class ChangeStreamService {
  private sseClients = new Map<string, Set<any>>();
  private gatewaySocket: Socket | null = null;
  private gatewayUrl: string;

  constructor(gatewayUrl: string) {
    this.gatewayUrl = gatewayUrl;
  }

  /** Lazily creates and returns the Socket.IO client connection to the gateway */
  private getGatewaySocket(): Socket {
    if (!this.gatewaySocket) {
      this.gatewaySocket = ioClient(this.gatewayUrl, {
        path: '/ws',
        transports: ['websocket', 'polling'],
        reconnection: true,
      });
    }
    return this.gatewaySocket;
  }

  /** Emits an event to a room via the gateway socket */
  broadcastToGateway(room: string, event: string, data: any): void {
    const s = this.getGatewaySocket();
    if (s.connected) {
      s.emit('internal:broadcast', { room, event, data });
    } else {
      s.once('connect', () => {
        s.emit('internal:broadcast', { room, event, data });
      });
      if (!s.connected) s.connect();
    }
  }

  /**
   * Start watching the Document collection for updates.
   * Broadcasts changes to Socket.IO rooms and SSE clients.
   */
  start(): void {
    // Eagerly connect to gateway
    this.getGatewaySocket();

    try {
      const changeStream = Document.watch(
        [{ $match: { operationType: { $in: ['update', 'replace'] } } }],
        { fullDocument: 'updateLookup' }
      );

      changeStream.on('change', (change: any) => {
        if (!change.fullDocument) return;

        const docId = change.documentKey._id.toString();
        const userId = change.fullDocument.userId?.toString();

        const event = {
          type: 'DOCUMENT_UPDATED',
          documentId: docId,
          status: change.fullDocument.status,
          embeddingStatus: change.fullDocument.embeddingStatus,
          updatedAt: change.fullDocument.updatedAt,
        };

        // Broadcast via Socket.IO to doc-specific and user-specific rooms
        this.broadcastToGateway(`doc:${docId}`, 'doc:status', event);
        if (userId) this.broadcastToGateway(`user:${userId}`, 'doc:status', event);

        // Also send to SSE clients (backward compat)
        const clients = this.sseClients.get(docId);
        if (clients && clients.size > 0) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          for (const client of clients) {
            client.write(data);
          }
          if (['ready', 'error'].includes(change.fullDocument.status)) {
            for (const client of clients) {
              client.write(`data: ${JSON.stringify({ type: 'PROCESSING_COMPLETE', status: change.fullDocument.status })}\n\n`);
            }
          }
        }
      });

      changeStream.on('error', (err) => {
        console.error('[changeStream] Error:', err.message);
      });

    } catch (err: any) {
      console.warn('[changeStream] Failed to start (replica set may be required):', err.message);
    }
  }

  /** Register an SSE client for a specific document's updates */
  addSSEClient(documentId: string, res: any): void {
    if (!this.sseClients.has(documentId)) this.sseClients.set(documentId, new Set());
    this.sseClients.get(documentId)!.add(res);
  }

  /** Unregister an SSE client */
  removeSSEClient(documentId: string, res: any): void {
    const clients = this.sseClients.get(documentId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) this.sseClients.delete(documentId);
    }
  }
}

// Singleton instance
const gatewayUrl = process.env.API_GATEWAY_URL || 'http://localhost:5001';
const changeStreamService = new ChangeStreamService(gatewayUrl);

// Named exports for backward compatibility
export const broadcastToGateway = (room: string, event: string, data: any) =>
  changeStreamService.broadcastToGateway(room, event, data);
export const startChangeStream = () => changeStreamService.start();
export const addSSEClient = (documentId: string, res: any) =>
  changeStreamService.addSSEClient(documentId, res);
export const removeSSEClient = (documentId: string, res: any) =>
  changeStreamService.removeSSEClient(documentId, res);

export default changeStreamService;
