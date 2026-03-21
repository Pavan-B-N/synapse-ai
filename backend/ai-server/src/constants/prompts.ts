/**
 * AI prompt templates — stored as constants for maintainability.
 * All prompt strings used across AI routes and services.
 */

/** Summarization format prompts */
export const SUMMARIZATION_PROMPTS: Record<string, string> = {
  brief: 'Provide a brief 2-3 sentence summary of the following text:',
  detailed: 'Provide a comprehensive summary with key themes, main arguments, and conclusions:',
  executive: 'Provide an executive summary suitable for senior management. Include key findings, implications, and recommended actions:',
  bullets: 'Summarize the following text as bullet points, covering all major topics:',
} as const;

/** Content generation type prompts */
export const GENERATION_TYPE_PROMPTS: Record<string, string> = {
  report: 'Generate a professional report. Include executive summary, key findings, analysis, and recommendations:',
  summary: 'Create a comprehensive summary for management:',
  briefing: 'Create a briefing document with key points, decisions needed, and action items:',
  comparison: 'Compare and contrast the key themes, findings, and recommendations:',
} as const;
