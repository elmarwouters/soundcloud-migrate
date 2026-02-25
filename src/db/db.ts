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

type Stmts = {
  upsertAccount: Database.Statement;
  getAccount: Database.Statement;
  upsertProgress: Database.Statement;
  getProgress: Database.Statement;
  markDone: Database.Statement;
  isDone: Database.Statement;
};

const stmtCache = new WeakMap<Database.Database, Stmts>();

const getStmts = (db: Database.Database): Stmts => {
  const cached = stmtCache.get(db);
  if (cached) return cached;
  const stmts: Stmts = {
    upsertAccount: db.prepare(
      `INSERT INTO accounts (name, access_token, refresh_token, expires_at)
       VALUES (@name, @access_token, @refresh_token, @expires_at)
       ON CONFLICT(name) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at`
    ),
    getAccount: db.prepare("SELECT * FROM accounts WHERE name = ?"),
    upsertProgress: db.prepare(
      `INSERT INTO progress (job, cursor)
       VALUES (?, ?)
       ON CONFLICT(job) DO UPDATE SET cursor = excluded.cursor`
    ),
    getProgress: db.prepare("SELECT * FROM progress WHERE job = ?"),
    markDone: db.prepare("INSERT OR IGNORE INTO done (job, item_id) VALUES (?, ?)"),
    isDone: db.prepare("SELECT 1 FROM done WHERE job = ? AND item_id = ?")
  };
  stmtCache.set(db, stmts);
  return stmts;
};

export const initializeDb = (dbPath: string): Database.Database => {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(schemaSql);
  return db;
};

export const upsertAccount = (db: Database.Database, account: AccountRow) => {
  getStmts(db).upsertAccount.run(account);
};

export const getAccount = (db: Database.Database, name: string): AccountRow | undefined => {
  return getStmts(db).getAccount.get(name) as AccountRow | undefined;
};

export const upsertProgress = (db: Database.Database, job: string, cursor: string | null) => {
  getStmts(db).upsertProgress.run(job, cursor);
};

export const getProgress = (db: Database.Database, job: string): ProgressRow | undefined => {
  return getStmts(db).getProgress.get(job) as ProgressRow | undefined;
};

export const markDone = (db: Database.Database, job: string, itemId: string) => {
  getStmts(db).markDone.run(job, itemId);
};

export const isDone = (db: Database.Database, job: string, itemId: string) => {
  return Boolean(getStmts(db).isDone.get(job, itemId));
};
