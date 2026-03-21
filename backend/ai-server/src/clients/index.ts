import config from '../config';
import { ChatClient } from './ChatClient/ChatClient';
import { AzureChatClient } from './ChatClient/AzureChatClient';
import { EmbeddingClient } from './EmbeddingClient/EmbeddingClient';
import { AzureEmbeddingClient } from './EmbeddingClient/AzureEmbeddingClient';

// Re-export types so consumers can reference the abstractions
export type { ChatClient, ChatMessage, ChatCompletionOptions, ChatCompletionResult } from './ChatClient/ChatClient';
export type { EmbeddingClient, EmbeddingResult, BatchEmbeddingResult } from './EmbeddingClient/EmbeddingClient';

function createChatClient(): ChatClient {
  const { endpoint, apiKey, deployment, apiVersion } = config.azure.openai;
  return new AzureChatClient({ endpoint, apiKey, deployment, apiVersion });
}

function createEmbeddingClient(): EmbeddingClient {
  const { endpoint, apiKey, embeddingDeployment, apiVersion } = config.azure.openai;
  return new AzureEmbeddingClient({ endpoint, apiKey, deployment: embeddingDeployment, apiVersion });
}

/** Pre-built singleton clients — resolved from config */
export const chatClient: ChatClient = createChatClient();
export const embeddingClient: EmbeddingClient = createEmbeddingClient();
