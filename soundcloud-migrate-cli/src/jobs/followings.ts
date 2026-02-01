import type Database from "better-sqlite3";
import { createApiClient } from "../sc/api.js";
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

const parseNextHref = (href: string) => {
  const url = new URL(href);
  return {
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries())
  } as { path: string; query: Record<string, string> };
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

  while (true) {
    const response = cursor
      ? await (() => {
          const parsed = parseNextHref(cursor);
          return sourceClient.get<FollowingsResponse>(parsed.path, parsed.query);
        })()
      : await sourceClient.get<FollowingsResponse>("/me/followings", {
          limit: options.limit,
          linked_partitioning: 1
        });

    for (const user of response.collection) {
      const userId = String(user.id);
      if (isDone(db, jobName, userId)) {
        continue;
      }

      await targetClient.put(`/me/followings/${userId}`);
      markDone(db, jobName, userId);
      logger.info({ userId }, "Followed user on target account");
      if (options.sleepMs > 0) {
        await sleep(options.sleepMs);
      }
    }

    cursor = response.next_href ?? null;
    upsertProgress(db, jobName, cursor);
    if (!cursor) {
      logger.info("Followings migration completed");
      break;
    }
  }
};
