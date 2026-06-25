import axios, { AxiosProgressEvent } from 'axios';

const API_BASE = 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('synapse_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      return Promise.reject(new Error('Your session has expired. Please log in again.'));
    }
    if (status === 403) {
      return Promise.reject(new Error('You do not have permission to perform this action.'));
    }
    const message = error.response?.data?.error?.message || error.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

// Auth APIs
export const authAPI = {
  register: (data: Record<string, unknown>) => api.post('/auth/register', data),
  login: (data: Record<string, unknown>) => api.post('/auth/login', data),
  verifyOtp: (data: { userId: string; otp: string }) => api.post('/auth/verify-otp', data),
  resendOtp: (data: { userId: string }) => api.post('/auth/resend-otp', data),
  getProfile: () => api.get('/auth/profile'),
  searchUsers: (q: string, limit = 5, skip = 0) => api.get('/auth/users/search', { params: { q, limit, skip } }),
  batchUsers: (userIds: string[]) => api.post('/auth/users/batch', { userIds }),
  updateProfile: (data: Record<string, unknown>) => api.put('/auth/profile', data),
  deleteAccount: () => api.delete('/auth/account'),
};

// Document APIs
export const documentAPI = {
  upload: (file: File, onProgress?: (e: AxiosProgressEvent) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    });
  },
  getAll: (params?: Record<string, unknown>) => api.get('/documents', { params }),
  getById: (id: string) => api.get(`/documents/${id}`),
  getContent: (id: string) => api.get(`/documents/${id}/content`),
  getDownloadUrl: (id: string) => `${API_BASE}/documents/${id}/download`,
  getStorage: () => api.get('/documents/user/storage'),
  delete: (id: string) => api.delete(`/documents/${id}`),
  share: (id: string, targetUserId: string) => api.post(`/documents/${id}/share`, { targetUserId }),
  unshare: (id: string, targetUserId: string) => api.delete(`/documents/${id}/share/${targetUserId}`),
};

// AI APIs
export const aiAPI = {
  query: (data: Record<string, unknown>) => api.post('/ai/query', data),
  summarize: (data: Record<string, unknown>) => api.post('/ai/summarize', data),
  generate: (data: Record<string, unknown>) => api.post('/ai/generate', data),
  search: (params?: Record<string, unknown>) => api.get('/ai/search', { params }),
  recommendations: (params?: Record<string, unknown>) => api.get('/ai/recommendations', { params }),
  history: (params?: Record<string, unknown>) => api.get('/ai/history', { params }),
  historyById: (documentId: string) => api.get(`/ai/history/${documentId}`),
  conversations: () => api.get('/ai/conversations'),
  conversationHistory: (conversationId: string) => api.get(`/ai/history/conversation/${conversationId}`),
  shareConversation: (conversationId: string, targetUserId: string) => api.post(`/ai/conversations/${conversationId}/share`, { targetUserId }),
  unshareConversation: (conversationId: string, targetUserId: string) => api.delete(`/ai/conversations/${conversationId}/share/${targetUserId}`),
  getSharedUsers: (conversationId: string) => api.get(`/ai/conversations/${conversationId}/shared-users`),
  deleteConversation: (conversationId: string) => api.delete(`/ai/conversations/${conversationId}`),
};

// System APIs
export const systemAPI = {
  health: () => api.get('/health'),
  dashboardStats: () => api.get('/dashboard/stats'),
};

// Quiz APIs
export const quizAPI = {
  generate: (data: Record<string, unknown>) => api.post('/quiz/generate', data),
  submit: (quizId: string, data: Record<string, unknown>) => api.post(`/quiz/${quizId}/submit`, data),
  history: (params?: Record<string, unknown>) => api.get('/quiz/history', { params }),
  getById: (quizId: string) => api.get(`/quiz/${quizId}`),
};

// Group Docs APIs
export const groupAPI = {
  create: (data: Record<string, unknown>) => api.post('/groups', data),
  list: () => api.get('/groups'),
  getById: (groupId: string) => api.get(`/groups/${groupId}`),
  chat: (groupId: string, data: Record<string, unknown>) => api.post(`/groups/${groupId}/chat`, data),
  update: (groupId: string, data: Record<string, unknown>) => api.put(`/groups/${groupId}`, data),
  delete: (groupId: string) => api.delete(`/groups/${groupId}`),
  cleanupDocument: (docId: string) => api.delete(`/groups/documents/${docId}`),
  share: (groupId: string, data: { targetUserId: string; role?: string; targetUserName?: string; targetUserEmail?: string }) => api.post(`/groups/${groupId}/share`, data),
  removeMember: (groupId: string, memberId: string) => api.delete(`/groups/${groupId}/members/${memberId}`),
  updateMemberRole: (groupId: string, memberId: string, role: string) => api.put(`/groups/${groupId}/members/${memberId}`, { role }),
  getMessages: (groupId: string, params?: Record<string, unknown>) => api.get(`/groups/${groupId}/messages`, { params }),
};

// Notification APIs
export const notificationAPI = {
  list: (params?: Record<string, unknown>) => api.get('/notifications', { params }),
  markRead: (notifId: string) => api.patch(`/notifications/${notifId}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

// Channel APIs
export const channelAPI = {
  create: (data: Record<string, unknown>) => api.post('/channels', data),
  list: (params?: Record<string, unknown>) => api.get('/channels', { params }),
  recommended: (params?: Record<string, unknown>) => api.get('/channels/recommended', { params }),
  my: (params?: Record<string, unknown>) => api.get('/channels/my', { params }),
  categories: () => api.get('/channels/categories'),
  getById: (id: string) => api.get(`/channels/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/channels/${id}`, data),
  delete: (id: string) => api.delete(`/channels/${id}`),
  join: (id: string) => api.post(`/channels/${id}/join`),
  leave: (id: string) => api.post(`/channels/${id}/leave`),
  approve: (id: string, userId: string) => api.post(`/channels/${id}/approve/${userId}`),
  reject: (id: string, userId: string) => api.post(`/channels/${id}/reject/${userId}`),
  invite: (id: string, data: Record<string, unknown>) => api.post(`/channels/${id}/invite`, data),
  removeMember: (id: string, userId: string) => api.delete(`/channels/${id}/members/${userId}`),
  changeRole: (id: string, userId: string, role: string) => api.put(`/channels/${id}/members/${userId}/role`, { role }),
  getMembers: (id: string) => api.get(`/channels/${id}/members`),
  attachWorkspace: (id: string, workspaceId: string) => api.post(`/channels/${id}/attach-workspace`, { workspaceId }),
  detachWorkspace: (id: string, workspaceId: string) => api.delete(`/channels/${id}/attach-workspace/${workspaceId}`),
  // Posts
  createPost: (id: string, data: FormData | Record<string, unknown>, isFormData = false) => {
    if (isFormData) {
      return api.post(`/channels/${id}/posts`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
    }
    return api.post(`/channels/${id}/posts`, data);
  },
  getPosts: (id: string, params?: Record<string, unknown>) => api.get(`/channels/${id}/posts`, { params }),
  deletePost: (id: string, postId: string) => api.delete(`/channels/${id}/posts/${postId}`),
  likePost: (id: string, postId: string) => api.post(`/channels/${id}/posts/${postId}/like`),
  dislikePost: (id: string, postId: string) => api.post(`/channels/${id}/posts/${postId}/dislike`),
  addComment: (id: string, postId: string, content: string) => api.post(`/channels/${id}/posts/${postId}/comments`, { content }),
  getComments: (id: string, postId: string) => api.get(`/channels/${id}/posts/${postId}/comments`),
};

export default api;
