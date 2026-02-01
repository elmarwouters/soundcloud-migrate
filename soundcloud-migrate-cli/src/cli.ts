#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { config } from "./config.js";
import { initializeDb } from "./db/db.js";
import { connectAccount } from "./sc/oauth.js";
import { runFollowingsMigration } from "./jobs/followings.js";
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
      return;
    }

    logger.error({ job }, "Unknown job");
    process.exitCode = 1;
  });

program.parseAsync().catch((error) => {
  logger.error({ err: error }, "CLI failed");
  process.exitCode = 1;
});
