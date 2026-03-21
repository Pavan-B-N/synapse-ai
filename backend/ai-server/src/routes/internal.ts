/**
 * AI SERVER — Internal Routes (S2S only, not exposed via gateway)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { aiService } from '../utils/container';
import { processDocument, deleteVectors } from '../workers/documentProcessor';

const router = Router();

/**
 * POST /internal/generate-text — Generate AI text completion
 *
 * @body {string} prompt                  - The text prompt to complete
 * @body {object} [options]               - AI completion options (systemPrompt, maxTokens, temperature)
 * @body {string} [systemPrompt]          - Flat alternative to options.systemPrompt
 * @body {number} [maxTokens]             - Flat alternative to options.maxTokens
 *
 * @response 200 { text: string, usage?: object }
 */
router.post('/generate-text', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { prompt, options, systemPrompt, maxTokens } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const mergedOptions = { ...options };
    if (systemPrompt && !mergedOptions.systemPrompt) mergedOptions.systemPrompt = systemPrompt;
    if (maxTokens && !mergedOptions.maxTokens) mergedOptions.maxTokens = maxTokens;
    const result = await aiService.completePrompt(prompt, mergedOptions);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /internal/generate-embedding — Generate embedding vector for text
 *
 * @body {string} text - The text to embed
 *
 * @response 200 { embedding: number[] }
 */
router.post('/generate-embedding', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = await aiService.createEmbedding(text);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /internal/process-document — Trigger async document processing (fire-and-forget)
 *
 * @body {string} documentId - The document ID to process
 *
 * @response 200 { accepted: true, documentId }
 */
router.post('/process-document', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { documentId } = req.body;
    if (!documentId) return res.status(400).json({ error: 'documentId is required' });
    res.json({ accepted: true, documentId });
    processDocument(documentId).catch(() => {});
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /internal/delete-vectors — Delete vectors for a document (fire-and-forget)
 *
 * @body {string} documentId - The document ID whose vectors to delete
 *
 * @response 200 { accepted: true, documentId }
 */
router.post('/delete-vectors', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { documentId } = req.body;
    if (!documentId) return res.status(400).json({ error: 'documentId is required' });
    res.json({ accepted: true, documentId });
    deleteVectors(documentId).catch(() => {});
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
