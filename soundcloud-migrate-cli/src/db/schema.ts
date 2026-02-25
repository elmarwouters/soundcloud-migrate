export const schemaSql = `
CREATE TABLE IF NOT EXISTS accounts (
  name TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  job TEXT PRIMARY KEY,
  cursor TEXT
);

CREATE TABLE IF NOT EXISTS done (
  job TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (job, item_id)
);
`;
