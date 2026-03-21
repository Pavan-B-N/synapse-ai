import config from '../../config';
import { IMessagePublisher, ProcessDocumentJob, DeleteVectorsJob } from './IMessagePublisher';
import { ServiceBusPublisher } from './ServiceBusPublisher';
import { HttpFallbackPublisher } from './HttpFallbackPublisher';

function createPublisher(): IMessagePublisher {
  if (config.serviceBus.connectionString) {
    console.log('[doc-server] Message queue: Azure Service Bus');
    return new ServiceBusPublisher(config.serviceBus.connectionString);
  }
  console.warn('[doc-server] Message queue: HTTP fallback (no Service Bus configured)');
  return new HttpFallbackPublisher();
}

const publisher: IMessagePublisher = createPublisher();

export const QUEUES = {
  DOCUMENT_PROCESSING: 'document-processing',
  VECTOR_CLEANUP: 'vector-cleanup',
};

export const documentQueue = {
  async add(_name: string, data: ProcessDocumentJob): Promise<void> {
    await publisher.publish('document-events', { documentId: data.documentId }, 'document.uploaded');
  },
};

export const vectorCleanupQueue = {
  async add(_name: string, data: DeleteVectorsJob): Promise<void> {
    await publisher.publish('document-events', { documentId: data.documentId }, 'document.delete-vectors');
  },
};

export { publisher };
export type { IMessagePublisher, ProcessDocumentJob, DeleteVectorsJob };
