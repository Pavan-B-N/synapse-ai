import config from '../../config';
import { IMessageSubscriber } from './IMessageSubscriber';
import { DocumentSubscriber } from './DocumentSubscriber';
import { AccountDeletionSubscriber } from './AccountDeletionSubscriber';
import { NoopSubscriber } from './NoopSubscriber';

export function createDocumentSubscriber(): IMessageSubscriber {
  if (config.serviceBus.connectionString) {
    return new DocumentSubscriber(config.serviceBus.connectionString, 'document-events', 'ai-processing');
  }
  return new NoopSubscriber();
}

export function createAccountDeletionSubscriber(): IMessageSubscriber {
  if (config.serviceBus.connectionString) {
    return new AccountDeletionSubscriber(config.serviceBus.connectionString);
  }
  return new NoopSubscriber();
}

export type { IMessageSubscriber };
