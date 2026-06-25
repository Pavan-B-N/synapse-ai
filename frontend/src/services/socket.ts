import { io, Socket } from 'socket.io-client';

const GATEWAY_URL = 'http://localhost:5001';

let socket: Socket | null = null;
let currentUserId: string | null = null;
let pendingRooms: Set<string> = new Set();

export function getSocket(): Socket {
  if (!socket) {
    socket = io(GATEWAY_URL, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
    // On every (re)connect, rejoin the user room and any pending rooms automatically
    socket.on('connect', () => {
      console.log('[socket] Connected to gateway');
      if (currentUserId) {
        socket!.emit('join', `user:${currentUserId}`);
      }
      // Rejoin any workspace/conversation rooms that were joined before reconnect
      for (const room of pendingRooms) {
        socket!.emit('join', room);
      }
    });
    socket.on('connect_error', (err) => {
      console.error('[socket] Connection error:', err.message);
    });
  }
  return socket;
}

export function connectSocket(userId: string) {
  currentUserId = userId;
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  } else {
    // Already connected — just make sure we're in the room
    s.emit('join', `user:${userId}`);
  }
  return s;
}

export function disconnectSocket() {
  currentUserId = null;
  if (socket?.connected) {
    socket.disconnect();
  }
}

// ── Document rooms ──

export function joinDocRoom(docId: string) {
  const room = `doc:${docId}`;
  pendingRooms.add(room);
  const s = getSocket();
  if (s.connected) s.emit('join', room);
}

export function leaveDocRoom(docId: string) {
  const room = `doc:${docId}`;
  pendingRooms.delete(room);
  const s = getSocket();
  if (s.connected) s.emit('leave', room);
}

export type DocStatusEvent = {
  documentId: string;
  status: string;
  embeddingStatus?: string;
  summary?: boolean;
  tags?: number;
};

export function onDocumentStatus(cb: (data: DocStatusEvent) => void) {
  const s = getSocket();
  s.on('doc:status', cb);
  return () => { s.off('doc:status', cb); };
}

// ── Workspace rooms (collaborative chat) ──

export function joinWorkspaceRoom(workspaceId: string) {
  const room = `workspace:${workspaceId}`;
  pendingRooms.add(room);
  const s = getSocket();
  if (s.connected) s.emit('join', room);
}

export function leaveWorkspaceRoom(workspaceId: string) {
  const room = `workspace:${workspaceId}`;
  pendingRooms.delete(room);
  const s = getSocket();
  if (s.connected) s.emit('leave', room);
}

export type WorkspaceMessageEvent = {
  _id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  role: string;
  content: string;
  createdAt: string;
};

export function onWorkspaceMessage(cb: (data: WorkspaceMessageEvent) => void) {
  const s = getSocket();
  s.on('workspace:message', cb);
  return () => { s.off('workspace:message', cb); };
}

// ── Notifications ──

export type NotificationEvent = {
  _id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  read: boolean;
  createdAt: string;
};

export function onNotification(cb: (data: NotificationEvent) => void) {
  const s = getSocket();
  s.on('notification', cb);
  return () => { s.off('notification', cb); };
}

export function onWorkspaceShared(cb: (data: { workspaceId: string; name: string; role: string; sharedBy: string }) => void) {
  const s = getSocket();
  s.on('workspace:shared', cb);
  return () => { s.off('workspace:shared', cb); };
}

export function onWorkspaceRemoved(cb: (data: { workspaceId: string; name: string }) => void) {
  const s = getSocket();
  s.on('workspace:removed', cb);
  return () => { s.off('workspace:removed', cb); };
}

export type WorkspaceTypingEvent = {
  workspaceId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
};

export function onWorkspaceTyping(cb: (data: WorkspaceTypingEvent) => void) {
  const s = getSocket();
  s.on('workspace:typing', cb);
  return () => { s.off('workspace:typing', cb); };
}

// ── Workspace document updates (real-time file add/remove) ──

export type WorkspaceDocumentsEvent = {
  workspaceId: string;
  documents: Array<{ _id: string; title: string; type: string }>;
  addedIds: string[];
  removedIds: string[];
};

export function onWorkspaceDocuments(cb: (data: WorkspaceDocumentsEvent) => void) {
  const s = getSocket();
  s.on('workspace:documents', cb);
  return () => { s.off('workspace:documents', cb); };
}

// ── Document sharing (real-time) ──

export type DocSharedEvent = {
  documentId: string;
  title: string;
  sharedBy: string;
};

export function onDocShared(cb: (data: DocSharedEvent) => void) {
  const s = getSocket();
  s.on('doc:shared', cb);
  return () => { s.off('doc:shared', cb); };
}

// ── Document unsharing / deletion (real-time) ──

export type DocUnsharedEvent = {
  documentId: string;
  title: string;
  deleted?: boolean;
};

export function onDocUnshared(cb: (data: DocUnsharedEvent) => void) {
  const s = getSocket();
  s.on('doc:unshared', cb);
  return () => { s.off('doc:unshared', cb); };
}

// ── Channel events (real-time) ──

export function joinChannelRoom(channelId: string) {
  const room = `channel:${channelId}`;
  pendingRooms.add(room);
  const s = getSocket();
  if (s.connected) s.emit('join', room);
}

export function leaveChannelRoom(channelId: string) {
  const room = `channel:${channelId}`;
  pendingRooms.delete(room);
  const s = getSocket();
  if (s.connected) s.emit('leave', room);
}

export function onChannelNewPost(cb: (data: { channelId: string; channelName: string; post: any }) => void) {
  const s = getSocket();
  s.on('channel:new-post', cb);
  return () => { s.off('channel:new-post', cb); };
}

export function onChannelPostDeleted(cb: (data: { channelId: string; postId: string }) => void) {
  const s = getSocket();
  s.on('channel:post-deleted', cb);
  return () => { s.off('channel:post-deleted', cb); };
}

export function onChannelNewComment(cb: (data: { channelId: string; postId: string; comment: any }) => void) {
  const s = getSocket();
  s.on('channel:new-comment', cb);
  return () => { s.off('channel:new-comment', cb); };
}

export function onChannelPostLiked(cb: (data: { channelId: string; postId: string; likeCount: number; dislikeCount: number }) => void) {
  const s = getSocket();
  s.on('channel:post-liked', cb);
  return () => { s.off('channel:post-liked', cb); };
}

export function onChannelJoinRequest(cb: (data: { channelId: string; channelName: string; userId: string; userName: string }) => void) {
  const s = getSocket();
  s.on('channel:join-request', cb);
  return () => { s.off('channel:join-request', cb); };
}

export function onChannelApproved(cb: (data: { channelId: string; channelName: string }) => void) {
  const s = getSocket();
  s.on('channel:approved', cb);
  return () => { s.off('channel:approved', cb); };
}

export function onChannelInvited(cb: (data: { channelId: string; channelName: string }) => void) {
  const s = getSocket();
  s.on('channel:invited', cb);
  return () => { s.off('channel:invited', cb); };
}

export function onChannelRemoved(cb: (data: { channelId: string; channelName: string }) => void) {
  const s = getSocket();
  s.on('channel:removed', cb);
  return () => { s.off('channel:removed', cb); };
}

export function onChannelRejected(cb: (data: { channelId: string; channelName: string }) => void) {
  const s = getSocket();
  s.on('channel:rejected', cb);
  return () => { s.off('channel:rejected', cb); };
}

// ── Chat sharing (real-time sidebar refresh) ──

export type ChatSharedEvent = {
  conversationId: string;
  sharedBy: string;
};

export function onChatShared(cb: (data: ChatSharedEvent) => void) {
  const s = getSocket();
  s.on('chat:shared', cb);
  return () => { s.off('chat:shared', cb); };
}

export type ChatUnsharedEvent = {
  conversationId: string;
  revokedBy: string;
};

export function onChatUnshared(cb: (data: ChatUnsharedEvent) => void) {
  const s = getSocket();
  s.on('chat:unshared', cb);
  return () => { s.off('chat:unshared', cb); };
}

// ── Conversation rooms (shared AI chat real-time) ──

export function joinConversationRoom(conversationId: string) {
  const room = `conversation:${conversationId}`;
  pendingRooms.add(room);
  const s = getSocket();
  if (s.connected) s.emit('join', room);
}

export function leaveConversationRoom(conversationId: string) {
  const room = `conversation:${conversationId}`;
  pendingRooms.delete(room);
  const s = getSocket();
  if (s.connected) s.emit('leave', room);
}

export type ConversationMessageEvent = {
  conversationId: string;
  query: string;
  answer: string;
  sources?: any[];
  recommendations?: string[];
  senderUserId?: string;
};

export function onConversationMessage(cb: (data: ConversationMessageEvent) => void) {
  const s = getSocket();
  s.on('conversation:message', cb);
  return () => { s.off('conversation:message', cb); };
}

// ── Workspace presence (online users) ──

export type WorkspacePresenceEvent = {
  workspaceId: string;
  onlineUsers: { userId: string; userName?: string }[];
};

export function onWorkspacePresence(cb: (data: WorkspacePresenceEvent) => void) {
  const s = getSocket();
  s.on('workspace:presence', cb);
  return () => { s.off('workspace:presence', cb); };
}

// ── Study Channels (events handled above in Channel events section) ──
