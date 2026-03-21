import axios, { AxiosInstance } from 'axios';
import config from '../../config';
import { CircuitBreaker } from '../circuitbreaker/CircuitBreaker';

class AIClient {
  private http: AxiosInstance;

  constructor(private cb: CircuitBreaker) {
    this.http = axios.create({
      baseURL: config.services.aiServer,
      timeout: 120000,
      headers: { 'x-internal-key': config.s2sToken.secret },
    });
  }

  private raidHeaders(raid?: string) {
    return raid ? { 'x-raid': raid } : {};
  }

  async generateText(prompt: string, systemPrompt?: string, maxTokens?: number, raid?: string): Promise<string> {
    return this.cb.execute(async () => {
      const { data } = await this.http.post('/internal/generate-text', { prompt, systemPrompt, maxTokens }, { headers: this.raidHeaders(raid) });
      return data.text;
    });
  }

  async getEmbedding(text: string, raid?: string): Promise<number[]> {
    return this.cb.execute(async () => {
      const { data } = await this.http.post('/internal/embedding', { text }, { headers: this.raidHeaders(raid) });
      return data.embedding;
    });
  }

  async query(question: string, userId: string, documentId?: string, raid?: string): Promise<any> {
    return this.cb.execute(async () => {
      const { data } = await this.http.post('/api/ai/query', { question, documentId }, { headers: { 'x-user-id': userId, 'x-user-email': '', ...this.raidHeaders(raid) } });
      return data;
    });
  }

  async getQueryHistory(userId: string, limit = 5, raid?: string): Promise<any[]> {
    return this.cb.execute(async () => {
      const { data } = await this.http.get('/api/ai/history', { params: { limit }, headers: { 'x-user-id': userId, 'x-user-email': '', ...this.raidHeaders(raid) } });
      return data?.data?.queries || data?.queries || [];
    });
  }

  get status() { return this.cb.status; }
}

export const aiClient = new AIClient(new CircuitBreaker('ai-server', 5, 30000));
