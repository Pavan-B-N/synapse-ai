import axios from 'axios';
import { EmbeddingClient, EmbeddingResult, BatchEmbeddingResult } from './EmbeddingClient';

export interface AzureEmbeddingClientConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

/**
 * AzureEmbeddingClient — Azure OpenAI embedding client.
 * Encapsulates URL construction, auth headers, and response parsing.
 */
export class AzureEmbeddingClient extends EmbeddingClient {
  private endpoint: string;
  private apiKey: string;
  private deployment: string;
  private apiVersion: string;

  constructor(config: AzureEmbeddingClientConfig) {
    super();
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.deployment = config.deployment;
    this.apiVersion = config.apiVersion;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const url = `${this.endpoint}openai/deployments/${this.deployment}/embeddings?api-version=${this.apiVersion}`;
    const response = await axios.post(url, { input: text }, {
      headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    const embedding = response.data.data[0].embedding;
    return { embedding, dimensions: embedding.length };
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    const url = `${this.endpoint}openai/deployments/${this.deployment}/embeddings?api-version=${this.apiVersion}`;
    const response = await axios.post(url, { input: texts }, {
      headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const embeddings = response.data.data.map((d: any) => d.embedding);
    return { embeddings, dimensions: embeddings[0]?.length || 0 };
  }
}

export default AzureEmbeddingClient;
