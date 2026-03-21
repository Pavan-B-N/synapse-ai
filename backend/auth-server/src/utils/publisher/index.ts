import config from '../../config';
import { IMessagePublisher } from './IMessagePublisher';
import ServiceBusPublisher from './ServiceBusPublisher';
import NoopPublisher from './NoopPublisher';

function createPublisher(): IMessagePublisher {
  if (config.serviceBus.connectionString) {
    console.log('[auth-server] Message publisher: Azure Service Bus');
    return new ServiceBusPublisher(config.serviceBus.connectionString);
  }
  console.warn('[auth-server] Message publisher: no-op');
  return new NoopPublisher();
}

export const publisher = createPublisher();
