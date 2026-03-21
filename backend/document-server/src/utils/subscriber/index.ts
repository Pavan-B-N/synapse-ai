import config from '../../config';
import { IMessageSubscriber } from './IMessageSubscriber';
import { AccountDeletionSubscriber } from './AccountDeletionSubscriber';
import { NoopSubscriber } from './NoopSubscriber';

export function createAccountDeletionSubscriber(): IMessageSubscriber {
  if (config.serviceBus.connectionString) {
    return new AccountDeletionSubscriber(config.serviceBus.connectionString);
  }
  return new NoopSubscriber();
}

export type { IMessageSubscriber };
