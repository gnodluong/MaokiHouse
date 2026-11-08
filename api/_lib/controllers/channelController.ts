import type { Request, Response, NextFunction } from 'express';
import { ChannelConnectionModel, channelConnectionId } from '../models/ChannelConnection';
import type { ChannelPlatform } from '../models/ChannelConnection';
import { MockChannelAdapter } from '../adapters/MockChannelAdapter';

const PLATFORMS: ChannelPlatform[] = ['airbnb', 'booking', 'agoda'];

const adapterFor = (platform: ChannelPlatform) => new MockChannelAdapter(platform);

export const listChannels = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hostId = req.user!.uid;
    const existing = await ChannelConnectionModel.list(hostId);
    const byPlatform = new Map(existing.map((c) => [c.platform, c]));
    const all = PLATFORMS.map(
      (platform) =>
        byPlatform.get(platform) || {
          id: platform,
          hostId,
          platform,
          status: 'disconnected' as const,
          connectedAt: null,
        }
    );
    res.json(all);
  } catch (error) {
    next(error);
  }
};

export const connectChannel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hostId = req.user!.uid;
    const platform = req.params.platform as ChannelPlatform;
    if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'Unknown platform' });
    await adapterFor(platform).connect(hostId);
    const updated = await ChannelConnectionModel.get(hostId, channelConnectionId(hostId, platform));
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const disconnectChannel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hostId = req.user!.uid;
    const platform = req.params.platform as ChannelPlatform;
    if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'Unknown platform' });
    await adapterFor(platform).disconnect(hostId);
    const updated = await ChannelConnectionModel.get(hostId, channelConnectionId(hostId, platform));
    res.json(updated);
  } catch (error) {
    next(error);
  }
};
