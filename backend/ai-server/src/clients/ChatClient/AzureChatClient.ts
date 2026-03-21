import axios from 'axios';
import { ChatClient, ChatMessage, ChatCompletionOptions, ChatCompletionResult } from './ChatClient';

export interface AzureChatClientConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

/**
 * AzureChatClient — Azure OpenAI chat completion client.
 * Encapsulates URL construction, auth headers, and response parsing.
 */
export class AzureChatClient extends ChatClient {
  private endpoint: string;
  private apiKey: string;
  private deployment: string;
  private apiVersion: string;

  constructor(config: AzureChatClientConfig) {
    super();
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.deployment = config.deployment;
    this.apiVersion = config.apiVersion;
  }

  async complete(messages: ChatMessage[], options: ChatCompletionOptions = {}): Promise<ChatCompletionResult> {
    const { maxTokens = 1000, temperature = 0.7 } = options;
    const url = `${this.endpoint}openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;
    const response = await axios.post(url, {
      messages,
      max_tokens: maxTokens,
      temperature,
    }, {
      headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' },
      timeout: 120000,
    });

    return {
      text: response.data.choices[0].message.content,
      usage: response.data.usage,
    };
  }
}

export default AzureChatClient;
