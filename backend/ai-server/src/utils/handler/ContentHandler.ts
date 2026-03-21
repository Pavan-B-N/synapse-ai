import Document from '../../models/Document';
import { aiService } from '../container';
import { ValidationError } from '../errors';
import { SUMMARIZATION_PROMPTS, GENERATION_TYPE_PROMPTS } from '../../constants/prompts';
import logger from '../../Logger';

class ContentHandler {
  async summarize(userId: string, text?: string, documentId?: string, format: string = 'detailed', raid?: string) {
    let content = text;
    if (documentId) {
      logger.info('Summarize: fetching document content', { raid, userId, meta: { documentId, format } });
      const doc = await Document.findOne({ _id: documentId, userId });
      if (!doc) throw new ValidationError('Document not found');
      content = (doc as any).content;
      logger.info('Summarize: document fetched', { raid, userId, meta: { documentId, contentLen: content?.length ?? 0 } });
    }
    if (!content || content.trim().length === 0) throw new ValidationError('Text or documentId is required');

    logger.info('Summarize: calling AI for summarization', { raid, userId, meta: { format, contentLen: content.length } });
    const result = await aiService.completePrompt(
      `${SUMMARIZATION_PROMPTS[format] || SUMMARIZATION_PROMPTS.detailed}\n\n${content.substring(0, 8000)}`,
      { maxTokens: 1000, temperature: 0.3 },
    );
    logger.info('Summarize: summary generated', { raid, userId, meta: { format, summaryLen: result.text.length } });
    return { summary: result.text, format, originalLength: content.length };
  }

  async generate(userId: string, type: string = 'report', documentIds: string[] = [], prompt?: string, raid?: string) {
    let combinedContent = '';
    if (documentIds.length > 0) {
      logger.info('Generate: fetching source documents', { raid, userId, meta: { type, docCount: documentIds.length } });
      const docs = await Document.find({ _id: { $in: documentIds }, userId }).select('title content summary');
      combinedContent = docs.map((d: any) => `## ${d.title}\n${d.summary || d.content?.substring(0, 3000) || ''}`).join('\n\n---\n\n');
      logger.info('Generate: documents fetched', { raid, userId, meta: { foundDocs: docs.length, contentLen: combinedContent.length } });
    }

    const typePrompts: Record<string, string> = {
      ...GENERATION_TYPE_PROMPTS,
      custom: prompt || 'Analyze the following documents and provide a comprehensive response:',
    };

    const fullPrompt = `${typePrompts[type] || typePrompts.report}\n\n${combinedContent}${prompt && type !== 'custom' ? `\n\nAdditional instructions: ${prompt}` : ''}`;
    logger.info('Generate: calling AI for content generation', { raid, userId, meta: { type, promptLen: fullPrompt.length } });
    const result = await aiService.completePrompt(fullPrompt, { maxTokens: 2000, temperature: 0.4 });
    logger.info('Generate: content generated', { raid, userId, meta: { type, resultLen: result.text.length } });
    return { content: result.text, type, sourcesCount: documentIds.length };
  }
}

export default new ContentHandler();
