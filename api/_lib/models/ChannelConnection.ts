import { createHostScopedModel } from './firestoreCrud';

export type ChannelPlatform = 'airbnb' | 'booking' | 'agoda';

export interface ChannelConnection {
  id: string; // `${hostId}__${platform}`: one document per host and platform
  hostId: string;
  platform: ChannelPlatform;
  status: 'connected' | 'disconnected';
  connectedAt: number | null;
}

export const ChannelConnectionModel = createHostScopedModel<ChannelConnection>('channelConnections');

/** Document id for a host's connection to one platform (never shared between hosts). */
export const channelConnectionId = (hostId: string, platform: ChannelPlatform) => `${hostId}__${platform}`;
