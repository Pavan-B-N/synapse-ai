export interface IMessageSubscriber {
  start(): Promise<void>;
  stop(): Promise<void>;
}
