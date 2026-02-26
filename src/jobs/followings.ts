import type Database from "better-sqlite3";
import { createApiClient, ApiError } from "../sc/api.js";
import { getProgress, isDone, markDone, upsertProgress } from "../db/db.js";
import { sleep } from "../sc/rateLimit.js";
import { logger } from "../logger.js";

export type FollowingsOptions = {
  limit: number;
  sleepMs: number;
};

type FollowingUser = {
  id: number;
};

type FollowingsResponse = {
  collection: FollowingUser[];
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

export const runFollowingsMigration = async (
  db: Database.Database,
  options: FollowingsOptions
) => {
  const sourceClient = createApiClient(db, "source");
  const targetClient = createApiClient(db, "target");
  const jobName = "followings";

  let cursor = getProgress(db, jobName)?.cursor ?? null;

  logger.info({ cursor }, "Starting followings migration");

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = cursor
      ? await (() => {
          const parsed = parseNextHref(cursor);
          return sourceClient.get<FollowingsResponse>(parsed.path, parsed.query);
        })()
      : await sourceClient.get<FollowingsResponse>("/me/followings", {
          limit: options.limit,
          linked_partitioning: 1
        });

    cursor = response.next_href ?? null;
    upsertProgress(db, jobName, cursor);

    for (const user of response.collection) {
      const userId = String(user.id);
      if (isDone(db, jobName, userId)) {
        continue;
      }

      try {
        await targetClient.put(`/me/followings/${userId}`);
        markDone(db, jobName, userId);
        logger.info({ userId }, "Followed user on target account");
        if (options.sleepMs > 0) {
          await sleep(options.sleepMs);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          logger.error({ err, userId }, "Persistent rate limit hit. Stopping migration to avoid further blocks.");
          throw err;
        }
        logger.error({ err, userId }, "Failed to follow user on target account");
      }
    }

    if (!cursor) {
      logger.info("Followings migration completed");
      break;
    }
  }
};
