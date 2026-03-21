import AIProvider from './AIProvider';
import type { ChatClient } from '../../clients';
import type { EmbeddingClient } from '../../clients';

/**
 * AzureAIProvider — Azure OpenAI implementation of AIProvider.
 * Delegates to injected ChatClient and EmbeddingClient for all API interactions.
 */
class AzureAIProvider extends AIProvider {
  private chatClient: ChatClient;
  private embeddingClient: EmbeddingClient;

  constructor(chatClient: ChatClient, embeddingClient: EmbeddingClient) {
    super('azure');
    this.chatClient = chatClient;
    this.embeddingClient = embeddingClient;
  }

  /** Generates a chat completion using Azure OpenAI */
  async generateText(prompt: string, options: any = {}) {
    const { maxTokens, temperature, systemPrompt = 'You are a helpful AI assistant for knowledge management.' } = options;
    return this.chatClient.complete(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
      { maxTokens, temperature },
    );
  }

  /** Generates a single embedding vector */
  async generateEmbedding(text: string) {
    return this.embeddingClient.embed(text);
  }

  /** Generates batch embeddings in a single API call */
  async generateEmbeddings(texts: string[]) {
    return this.embeddingClient.embedBatch(texts);
  }

  /** Verifies Azure OpenAI connectivity */
  async healthCheck() {
    try { await this.generateText('Hello', { maxTokens: 5 }); return { healthy: true, provider: this.name }; }
    catch { return { healthy: false, provider: this.name }; }
  }
}

export default AzureAIProvider;
