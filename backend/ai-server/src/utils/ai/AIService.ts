import AIProvider from './AIProvider';
import { withRetry } from '../helpers';
import { AIServiceError } from '../errors';
import { IAIService } from './IAIService';
import logger from '../../Logger';

/**
 * AIService — Central AI orchestration with retry and circuit-breaking.
 * Delegates to a pluggable AIProvider implementation.
 */
class AIService implements IAIService {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /** Generates a text completion with automatic retry */
  async completePrompt(prompt: string, options: any = {}) {
    try {
      logger.debug('AIService.completePrompt: calling AI provider', { meta: { promptLen: prompt.length, maxTokens: options.maxTokens, temperature: options.temperature } });
      const result = await withRetry(() => this.provider.generateText(prompt, options), { maxRetries: 3, label: 'completePrompt' });
      logger.debug('AIService.completePrompt: response received', { meta: { resultLen: result.text?.length } });
      return { ...result, fromCache: false };
    } catch (error: any) {
      logger.error('AIService.completePrompt: failed after retries', { meta: { error: error.message } });
      throw new AIServiceError(`AI completePrompt failed: ${error.message}`);
    }
  }

  /** Creates a single embedding vector from text */
  async createEmbedding(text: string) {
    try {
      logger.debug('AIService.createEmbedding: generating embedding', { meta: { textLen: text.length } });
      return await withRetry(() => this.provider.generateEmbedding(text), { maxRetries: 2 });
    } catch (error: any) {
      logger.error('AIService.createEmbedding: failed', { meta: { error: error.message } });
      throw new AIServiceError(`AI createEmbedding failed: ${error.message}`);
    }
  }

  /** Creates batch embedding vectors */
  async createBatchEmbeddings(texts: string[]) {
    try {
      logger.debug('AIService.createBatchEmbeddings: generating batch', { meta: { batchSize: texts.length } });
      return await withRetry(() => this.provider.generateEmbeddings(texts), { maxRetries: 2 });
    } catch (error: any) {
      logger.error('AIService.createBatchEmbeddings: failed', { meta: { error: error.message, batchSize: texts.length } });
      throw new AIServiceError(`AI createBatchEmbeddings failed: ${error.message}`);
    }
  }

  /** Checks the health of the underlying AI provider */
  async checkHealth() { return this.provider.healthCheck(); }

  /** Returns the name of the active AI provider */
  getProviderName() { return this.provider.name; }
}

export default AIService;
