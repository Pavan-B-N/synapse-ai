export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface ChatCompletionResult {
  text: string;
  usage?: any;
}

/**
 * ChatClient — Abstract client for chat completion APIs.
 * Implement this to support different providers (Azure, OpenAI, Anthropic, etc.).
 */
export abstract class ChatClient {
  abstract complete(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<ChatCompletionResult>;
}

export default ChatClient;
