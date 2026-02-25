#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { config } from "./config.js";
import { initializeDb, upsertAccount } from "./db/db.js";
import { connectAccount, loginWithCredentials } from "./sc/oauth.js";
import { runFollowingsMigration } from "./jobs/followings.js";
import { runLikesMigration } from "./jobs/likes.js";
import { runRepostsMigration } from "./jobs/reposts.js";
import { logger } from "./logger.js";

const program = new Command();

program
  .name("sc-migrate")
  .description("Migrate actions between SoundCloud accounts")
  .version("0.1.0");

program
  .command("connect")
  .argument("<account>", "Account name: source or target")
  .action(async (account: string) => {
    if (account !== "source" && account !== "target") {
      logger.error("Account must be either 'source' or 'target'");
      process.exitCode = 1;
      return;
    }
    const db = initializeDb(config.DB_PATH);
    await connectAccount(db, account);
    db.close();
  });

program
  .command("run")
  .argument("<job>", "Job name")
  .option("--limit <number>", "Page size", "200")
  .option("--sleep <number>", "Sleep between actions in ms", String(config.SLEEP_MS))
  .action(async (job: string, options: { limit: string; sleep: string }) => {
    const limit = Number(options.limit);
    const sleepMs = Number(options.sleep);
    if (!Number.isInteger(limit) || limit <= 0) {
      logger.error("--limit must be a positive integer");
      process.exitCode = 1;
      return;
    }
    if (!Number.isInteger(sleepMs) || sleepMs < 0) {
      logger.error("--sleep must be a non-negative integer");
      process.exitCode = 1;
      return;
    }

    const db = initializeDb(config.DB_PATH);

    if (job === "followings") {
      await runFollowingsMigration(db, { limit, sleepMs });
      db.close();
      return;
    }

    if (job === "likes") {
      await runLikesMigration(db, { limit, sleepMs });
      db.close();
      return;
    }

    if (job === "reposts") {
      await runRepostsMigration(db, { limit, sleepMs });
      db.close();
      return;
    }

    if (job === "all") {
      await runFollowingsMigration(db, { limit, sleepMs });
      await runLikesMigration(db, { limit, sleepMs });
      await runRepostsMigration(db, { limit, sleepMs });
      db.close();
      return;
    }

    db.close();
    logger.error({ job }, "Unknown job");
    process.exitCode = 1;
  });

program
  .command("login")
  .argument("<account>", "Account name: source or target")
  .description("Obtain OAuth tokens via username/password credentials (for CI/CD, no browser required)")
  .action(async (account: string) => {
    if (account !== "source" && account !== "target") {
      logger.error("Account must be either 'source' or 'target'");
      process.exitCode = 1;
      return;
    }
    const prefix = `SC_${account.toUpperCase()}`;
    const username = process.env[`${prefix}_USERNAME`];
    const password = process.env[`${prefix}_PASSWORD`];
    if (!username || !password) {
      logger.error(
        `${prefix}_USERNAME and ${prefix}_PASSWORD environment variables must be set`
      );
      process.exitCode = 1;
      return;
    }
    const db = initializeDb(config.DB_PATH);
    await loginWithCredentials(db, account, username, password);
    db.close();
  });

program
  .command("seed")
  .argument("<account>", "Account name: source or target")
  .description("Seed OAuth tokens from environment variables (for CI/CD)")
  .action(async (account: string) => {
    if (account !== "source" && account !== "target") {
      logger.error("Account must be either 'source' or 'target'");
      process.exitCode = 1;
      return;
    }
    const prefix = `SC_${account.toUpperCase()}`;
    const accessToken = process.env[`${prefix}_ACCESS_TOKEN`];
    const refreshToken = process.env[`${prefix}_REFRESH_TOKEN`];
    if (!accessToken || !refreshToken) {
      logger.error(
        `${prefix}_ACCESS_TOKEN and ${prefix}_REFRESH_TOKEN environment variables must be set`
      );
      process.exitCode = 1;
      return;
    }
    const db = initializeDb(config.DB_PATH);
    upsertAccount(db, {
      name: account,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: 0
    });
    logger.info({ name: account }, "Seeded OAuth tokens for account");
    db.close();
  });

program.parseAsync().catch((error) => {
  logger.error({ err: error }, "CLI failed");
  process.exit(1);
});
