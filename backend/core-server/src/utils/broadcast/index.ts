import config from '../../config';
import { IBroadcaster } from './IBroadcaster';
import { SocketIOBroadcaster } from './SocketIOBroadcaster';
import { NoopBroadcaster } from './NoopBroadcaster';

function createBroadcaster(): IBroadcaster {
  if (config.gateway.url) {
    return new SocketIOBroadcaster();
  }
  return new NoopBroadcaster();
}

export const broadcaster: IBroadcaster = createBroadcaster();
export type { IBroadcaster };
