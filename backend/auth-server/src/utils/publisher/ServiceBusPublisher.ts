import { ServiceBusClient, ServiceBusSender } from '@azure/service-bus';
import config from '../../config';
import { IMessagePublisher } from './IMessagePublisher';

class ServiceBusPublisher implements IMessagePublisher {
  private client: ServiceBusClient;
  private senders = new Map<string, ServiceBusSender>();

  constructor(connectionString: string) {
    this.client = new ServiceBusClient(connectionString);
  }

  private getSender(topic: string): ServiceBusSender {
    let sender = this.senders.get(topic);
    if (!sender) {
      sender = this.client.createSender(topic);
      this.senders.set(topic, sender);
    }
    return sender;
  }

  async publish(topic: string, body: Record<string, unknown>, label?: string): Promise<void> {
    const sender = this.getSender(topic);
    await sender.sendMessages({
      body,
      subject: label,
      applicationProperties: { source: config.serviceName },
    });
  }

  async close(): Promise<void> {
    for (const sender of this.senders.values()) await sender.close();
    await this.client.close();
  }
}

export default ServiceBusPublisher;
