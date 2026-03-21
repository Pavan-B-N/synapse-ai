import axios from 'axios';
import config from '../../config';
import { IMessagePublisher } from './IMessagePublisher';

class HttpFallbackPublisher implements IMessagePublisher {
  private s2sHeaders = { 'x-internal-key': config.s2sToken.secret };

  async publish(topic: string, body: Record<string, unknown>, label?: string): Promise<void> {
    const endpoint = label === 'document.delete-vectors'
      ? `${config.services.aiServer}/internal/delete-vectors`
      : `${config.services.aiServer}/internal/process-document`;
    try {
      await axios.post(endpoint, body, { headers: this.s2sHeaders, timeout: 5000 });
    } catch (err: any) {
      console.warn(`[doc-server] HTTP fallback publish failed (${label}):`, err.message);
    }
  }

  async close(): Promise<void> { /* no-op */ }
}

export { HttpFallbackPublisher };
