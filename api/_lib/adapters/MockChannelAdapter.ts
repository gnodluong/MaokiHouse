import type { ChannelAdapter } from './ChannelAdapter';
import type { Booking } from '../models/Booking';
import { ChannelConnectionModel, channelConnectionId } from '../models/ChannelConnection';
import type { ChannelPlatform } from '../models/ChannelConnection';

/**
 * No-op stand-in for a real OTA integration. Real Airbnb/Booking.com/Agoda
 * sync requires partner API approval from each platform and is out of scope
 * for this phase — this adapter just flips connection status so the
 * dashboard UI has something real to talk to.
 */
export class MockChannelAdapter implements ChannelAdapter {
  constructor(public platform: ChannelPlatform) {}

  async connect(hostId: string): Promise<void> {
    await ChannelConnectionModel.upsert(hostId, channelConnectionId(hostId, this.platform), {
      hostId,
      platform: this.platform,
      status: 'connected',
      connectedAt: Date.now(),
    });
  }

  async disconnect(hostId: string): Promise<void> {
    await ChannelConnectionModel.upsert(hostId, channelConnectionId(hostId, this.platform), {
      hostId,
      platform: this.platform,
      status: 'disconnected',
      connectedAt: null,
    });
  }

  async fetchBookings(_hostId: string): Promise<Booking[]> {
    return [];
  }

  async pushAvailability(_hostId: string, _propertyId: string): Promise<void> {
    // no-op until a real partner API integration exists
    return;
  }
}
