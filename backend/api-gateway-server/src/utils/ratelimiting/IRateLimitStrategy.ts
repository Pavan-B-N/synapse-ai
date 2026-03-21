export interface IRateLimitStrategy {
  consume(key: string): Promise<{ remainingPoints: number; msBeforeNext: number }>;
  getMaxPoints(): number;
}
