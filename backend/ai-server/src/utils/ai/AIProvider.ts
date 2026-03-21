export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  [key: string]: any;
}

/**
 * AIProvider — Abstract base class for all AI provider implementations.
 * Extend this class to add new providers (e.g., OpenAI, Anthropic).
 */
export abstract class AIProvider {
  name: string;
  constructor(name: string) { this.name = name; }

  /** Generates text completion from a prompt */
  abstract generateText(prompt: string, options?: GenerationOptions): Promise<{ text: string; usage?: any }>;

  /** Generates a single embedding vector from text */
  abstract generateEmbedding(text: string): Promise<{ embedding: number[]; dimensions: number }>;

  /** Generates embeddings for multiple texts in batch */
  async generateEmbeddings(texts: string[]): Promise<{ embeddings: number[][]; dimensions: number }> {
    const embeddings: number[][] = [];
    for (const text of texts) {
      const r = await this.generateEmbedding(text);
      embeddings.push(r.embedding);
    }
    return { embeddings, dimensions: embeddings[0]?.length || 0 };
  }

  /** Checks provider health */
  async healthCheck(): Promise<{ healthy: boolean; provider: string; details?: any }> {
    return { healthy: true, provider: this.name };
  }
}

export default AIProvider;
