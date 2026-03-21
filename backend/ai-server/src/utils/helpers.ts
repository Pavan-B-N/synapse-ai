import crypto from 'crypto';

export async function withRetry(fn: () => Promise<any>, options: any = {}) {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await fn(); } catch (error: any) {
      if (attempt === maxRetries) throw error;
      await new Promise((r) => setTimeout(r, Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)));
    }
  }
}

export function generateIdempotencyKey(...parts: string[]) {
  return crypto.createHash('sha256').update(parts.join(':')).digest('hex');
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function chunkText(text: string, options: any = {}) {
  const { chunkSize = 500, overlap = 50 } = options;
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push({
        text: chunk.trim(),
        startIndex: i,
        endIndex: Math.min(i + chunkSize, words.length),
        wordCount: chunk.split(/\s+/).length,
      });
    }
  }
  return chunks;
}
