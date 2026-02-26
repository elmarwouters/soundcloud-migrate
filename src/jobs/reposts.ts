import type Database from "better-sqlite3";
import { createApiClient, ApiError } from "../sc/api.js";
import { getProgress, isDone, markDone, upsertProgress } from "../db/db.js";
import { sleep } from "../sc/rateLimit.js";
import { logger } from "../logger.js";

export type RepostsOptions = {
  limit: number;
  sleepMs: number;
};

type RepostedTrack = {
  id: number;
};

type RepostsResponse = {
  collection: {
    type: string;
    track?: {
      id: number;
    };
    playlist?: {
      id: number;
    };
  }[];
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

export const runRepostsMigration = async (
  db: Database.Database,
  options: RepostsOptions
) => {
  const sourceClient = createApiClient(db, "source");
  const targetClient = createApiClient(db, "target");
  const jobName = "reposts";

  let cursor = getProgress(db, jobName)?.cursor ?? null;

  logger.info({ cursor }, "Starting reposts migration");

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = cursor
      ? await (() => {
          const parsed = parseNextHref(cursor);
          return sourceClient.get<RepostsResponse>(parsed.path, parsed.query);
        })()
      : await sourceClient.get<RepostsResponse>("/me/activities", {
          limit: options.limit,
          linked_partitioning: 1
        });

    cursor = response.next_href ?? null;
    upsertProgress(db, jobName, cursor);

    for (const item of response.collection) {
      if ((item.type !== "track-repost" && item.type !== "playlist-repost") || (!item.track && !item.playlist)) {
        continue;
      }
      const type = item.type === "track-repost" ? "tracks" : "playlists";
      const targetItem = item.track || item.playlist;
      if (!targetItem) continue;
      
      const itemId = String(targetItem.id);
      if (isDone(db, jobName, itemId)) {
        continue;
      }

      try {
        await targetClient.post(`/reposts/${type}/${itemId}`);
        markDone(db, jobName, itemId);
        logger.info({ itemId, type }, "Reposted item on target account");
        if (options.sleepMs > 0) {
          await sleep(options.sleepMs);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          logger.error({ err, itemId }, "Persistent rate limit hit. Stopping migration to avoid further blocks.");
          throw err;
        }
        logger.error({ err, itemId, type }, "Failed to repost item on target account");
      }
    }

    if (!cursor) {
      logger.info("Reposts migration completed");
      break;
    }
  }
};
