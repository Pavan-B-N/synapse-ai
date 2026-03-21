import axios, { AxiosInstance } from 'axios';
import config from '../../config';
import { CircuitBreaker } from '../circuitbreaker/CircuitBreaker';

class DocumentClient {
  private http: AxiosInstance;

  constructor(private cb: CircuitBreaker) {
    this.http = axios.create({
      baseURL: config.services.documentServer,
      timeout: 15000,
      headers: { 'x-internal-key': config.s2sToken.secret },
    });
  }

  private raidHeaders(raid?: string) {
    return raid ? { 'x-raid': raid } : {};
  }

  async getDocumentContent(documentId: string, userId: string, raid?: string): Promise<{ title: string; content: string; mimeType: string }> {
    return this.cb.execute(async () => {
      const { data } = await this.http.get(`/api/documents/${documentId}/content`, { headers: { 'x-user-id': userId, ...this.raidHeaders(raid) } });
      return data?.data?.document || data;
    });
  }

  async listDocuments(userId: string, page = 1, limit = 50, raid?: string): Promise<any> {
    return this.cb.execute(async () => {
      const { data } = await this.http.get('/api/documents', { params: { page, limit }, headers: { 'x-user-id': userId, 'x-user-email': '', ...this.raidHeaders(raid) } });
      return data?.data || data;
    });
  }

  async shareDocument(documentId: string, ownerUserId: string, targetUserId: string, raid?: string): Promise<void> {
    return this.cb.execute(async () => {
      await this.http.post(`/api/documents/${documentId}/share`, { targetUserId }, { headers: { 'x-user-id': ownerUserId, ...this.raidHeaders(raid) } });
    });
  }

  get status() { return this.cb.status; }
}

export const documentClient = new DocumentClient(new CircuitBreaker('document-server', 5, 30000));
