export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private successCount = 0;

  constructor(private name: string, private threshold: number = 5, private timeout: number = 30000, private halfOpenMax: number = 3) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) { this.state = 'HALF_OPEN'; this.successCount = 0; }
      else throw new Error(`Circuit breaker [${this.name}] is OPEN`);
    }
    try { const r = await fn(); this.onSuccess(); return r; }
    catch (e) { this.onFailure(); throw e; }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') { this.successCount++; if (this.successCount >= this.halfOpenMax) { this.state = 'CLOSED'; this.failures = 0; } }
    else this.failures = 0;
  }

  private onFailure() {
    this.failures++; this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) { this.state = 'OPEN'; }
  }

  get status() { return { name: this.name, state: this.state, failures: this.failures }; }
}
