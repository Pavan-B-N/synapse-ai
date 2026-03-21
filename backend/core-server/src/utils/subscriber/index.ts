import config from '../../config';
import { IMessageSubscriber } from './IMessageSubscriber';
import { NotificationSubscriber } from './NotificationSubscriber';
import { AccountDeletionSubscriber } from './AccountDeletionSubscriber';
import { NoopSubscriber } from './NoopSubscriber';

export function createNotificationSubscriber(): IMessageSubscriber {
  if (config.serviceBus.connectionString) {
    return new NotificationSubscriber(config.serviceBus.connectionString);
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
