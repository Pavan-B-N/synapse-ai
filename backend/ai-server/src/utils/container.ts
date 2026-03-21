/**
 * Composition Root — wires all AI-server dependencies with constructor injection.
 * Import singletons from here instead of individual class files.
 */
import AzureAIProvider from './ai/AzureAIProvider';
import AIService from './ai/AIService';
import { AzureSearchStore } from './vectorstore/AzureSearchStore';
import VectorStore from './vectorstore/VectorStore';
import SearchService from './search/SearchService';
import RAGService from './rag/RAGService';
import RecommendationService from './recommendation/RecommendationService';
import { chatClient, embeddingClient } from '../clients';

// ── Layer 1: Providers ──
const aiProvider = new AzureAIProvider(chatClient, embeddingClient);
const azureSearchStore = new AzureSearchStore();

// ── Layer 2: Core services (depend on providers) ──
export const aiService = new AIService(aiProvider);
export const vectorStore = new VectorStore(azureSearchStore);

// ── Layer 3: Higher-level services (depend on core services) ──
export const searchService = new SearchService(aiService, vectorStore);
export const ragService = new RAGService(aiService, vectorStore);
export const recommendationService = new RecommendationService(aiService, vectorStore);
