export interface IMessagePublisher {
  publish(topic: string, body: Record<string, unknown>, label?: string): Promise<void>;
  close(): Promise<void>;
}

export interface ProcessDocumentJob {
  documentId: string;
}

export interface DeleteVectorsJob {
  documentId: string;
}
