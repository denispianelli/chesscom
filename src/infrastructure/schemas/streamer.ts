import { z } from "zod";

/** Zod schema for `GET /pub/streamers`. */

const streamerPlatformSchema = z.object({
  type: z.string(),
  channel_url: z.string().optional(),
  stream_url: z.string().optional(),
  is_live: z.boolean().optional(),
  is_main_live_platform: z.boolean().optional(),
});

const streamerSchema = z.object({
  username: z.string(),
  url: z.string(),
  avatar: z.string().optional(),
  twitch_url: z.string().optional(),
  is_live: z.boolean().optional(),
  is_community_streamer: z.boolean().optional(),
  platforms: z.array(streamerPlatformSchema).optional(),
});

/** The list of Chess.com streamers — `GET /pub/streamers`. */
export const streamersSchema = z.object({
  streamers: z.array(streamerSchema),
});

/** One streaming platform a streamer broadcasts on. */
export type StreamerPlatform = z.infer<typeof streamerPlatformSchema>;
/** A Chess.com streamer. */
export type Streamer = z.infer<typeof streamerSchema>;
/** The list of Chess.com streamers. */
export type Streamers = z.infer<typeof streamersSchema>;
