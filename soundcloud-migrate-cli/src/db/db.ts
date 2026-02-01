import Database from "better-sqlite3";
import { schemaSql } from "./schema.js";

export type AccountRow = {
  name: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

export type ProgressRow = {
  job: string;
  cursor: string | null;
};

export type DoneRow = {
  job: string;
  item_id: string;
};

export const initializeDb = (dbPath: string) => {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(schemaSql);
  return db;
};

export const upsertAccount = (db: Database.Database, account: AccountRow) => {
  const stmt = db.prepare(
    `INSERT INTO accounts (name, access_token, refresh_token, expires_at)
     VALUES (@name, @access_token, @refresh_token, @expires_at)
     ON CONFLICT(name) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at`
  );
  stmt.run(account);
};

export const getAccount = (db: Database.Database, name: string): AccountRow | undefined => {
  const stmt = db.prepare("SELECT * FROM accounts WHERE name = ?");
  return stmt.get(name) as AccountRow | undefined;
};

export const upsertProgress = (db: Database.Database, job: string, cursor: string | null) => {
  const stmt = db.prepare(
    `INSERT INTO progress (job, cursor)
     VALUES (?, ?)
     ON CONFLICT(job) DO UPDATE SET cursor = excluded.cursor`
  );
  stmt.run(job, cursor);
};

export const getProgress = (db: Database.Database, job: string): ProgressRow | undefined => {
  const stmt = db.prepare("SELECT * FROM progress WHERE job = ?");
  return stmt.get(job) as ProgressRow | undefined;
};

export const markDone = (db: Database.Database, job: string, itemId: string) => {
  const stmt = db.prepare("INSERT OR IGNORE INTO done (job, item_id) VALUES (?, ?)");
  stmt.run(job, itemId);
};

export const isDone = (db: Database.Database, job: string, itemId: string) => {
  const stmt = db.prepare("SELECT 1 FROM done WHERE job = ? AND item_id = ?");
  return Boolean(stmt.get(job, itemId));
};
