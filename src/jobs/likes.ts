import type Database from "better-sqlite3";
import { createApiClient } from "../sc/api.js";
import { getProgress, isDone, markDone, upsertProgress } from "../db/db.js";
import { sleep } from "../sc/rateLimit.js";
import { logger } from "../logger.js";

export type LikesOptions = {
  limit: number;
  sleepMs: number;
};

type LikedTrack = {
  id: number;
};

type LikesResponse = {
  collection: LikedTrack[];
  next_href?: string | null;
};

const MAX_PAGES = 10_000;

const parseNextHref = (href: string): { path: string; query: Record<string, string | number> } => {
  const url = new URL(href);
  return {
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries())
  };
};

export const runLikesMigration = async (
  db: Database.Database,
  options: LikesOptions
) => {
  const sourceClient = createApiClient(db, "source");
  const targetClient = createApiClient(db, "target");
  const jobName = "likes";

  let cursor = getProgress(db, jobName)?.cursor ?? null;

  logger.info({ cursor }, "Starting likes migration");

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = cursor
      ? await (() => {
          const parsed = parseNextHref(cursor);
          return sourceClient.get<LikesResponse>(parsed.path, parsed.query);
        })()
      : await sourceClient.get<LikesResponse>("/me/likes/tracks", {
          limit: options.limit,
          linked_partitioning: 1
        });

    cursor = response.next_href ?? null;
    upsertProgress(db, jobName, cursor);

    for (const track of response.collection) {
      const trackId = String(track.id);
      if (isDone(db, jobName, trackId)) {
        continue;
      }

      try {
        await targetClient.put(`/me/likes/tracks/${trackId}`);
        markDone(db, jobName, trackId);
        logger.info({ trackId }, "Liked track on target account");
        if (options.sleepMs > 0) {
          await sleep(options.sleepMs);
        }
      } catch (err) {
        logger.error({ err, trackId }, "Failed to like track on target account");
      }
    }

    if (!cursor) {
      logger.info("Likes migration completed");
      break;
    }
  }
};
