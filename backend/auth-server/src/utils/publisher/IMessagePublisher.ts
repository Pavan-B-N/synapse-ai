export interface IMessagePublisher {
  publish(topic: string, body: Record<string, unknown>, label?: string): Promise<void>;
  close(): Promise<void>;
}
