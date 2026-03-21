export interface IBroadcaster {
  emit(room: string, event: string, data: unknown): void;
  connect(): void;
  disconnect(): void;
}
