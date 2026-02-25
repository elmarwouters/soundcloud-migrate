import type Database from "better-sqlite3";
import { config, OAUTH_CONFIG } from "../config.js";
import { getAccount, upsertAccount } from "../db/db.js";
import { refreshAccessToken } from "./oauth.js";
import { withRetries } from "./rateLimit.js";

export type ApiClient = {
  get: <T>(path: string, query?: Record<string, string | number>) => Promise<T>;
  put: <T>(path: string, body?: Record<string, unknown>) => Promise<T | undefined>;
  post: <T>(path: string, body?: Record<string, unknown>) => Promise<T | undefined>;
  delete: <T>(path: string) => Promise<T | undefined>;
};

class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const isRetryableError = (error: unknown): boolean => {
  if (error instanceof ApiError) {
    return error.status >= 500 || error.status === 429;
  }
  return true;
};

const TOKEN_EXPIRY_BUFFER_MS = 300_000;

const ensureValidToken = async (db: Database.Database, accountName: "source" | "target") => {
  const account = getAccount(db, accountName);
  if (!account) {
    throw new Error(
      `Account ${accountName} is not connected.\n` +
      `Run "sc-migrate connect ${accountName}" (after "npm run build"),\n` +
      `or in development: "npm run dev -- connect ${accountName}".`
    );
  }
  if (Date.now() < account.expires_at - TOKEN_EXPIRY_BUFFER_MS) {
    return account;
  }

  const refreshed = await refreshAccessToken(account.refresh_token);
  const expiresAt = Date.now() + refreshed.expires_in * 1000;
  const updated = {
    name: accountName,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: expiresAt
  };
  upsertAccount(db, updated);
  return updated;
};

const buildUrl = (path: string, query?: Record<string, string | number>) => {
  const url = new URL(path, OAUTH_CONFIG.apiBaseUrl);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
};

export const createApiClient = (db: Database.Database, accountName: "source" | "target"): ApiClient => {
  const request = async <T>(
    method: "GET" | "PUT" | "POST" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | number>
  ): Promise<T | undefined> => {
    return withRetries(async () => {
      const account = await ensureValidToken(db, accountName);
      const headers: Record<string, string> = {
        Authorization: `OAuth ${account.access_token}`,
        "User-Agent": config.USER_AGENT
      };
      if (body) {
        headers["Content-Type"] = "application/json";
      }
      const response = await fetch(buildUrl(path, query), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        const text = await response.text();
        throw new ApiError(response.status, `SoundCloud API error ${response.status}: ${text}`);
      }

      if (response.status === 204) {
        return undefined;
      }
      return (await response.json()) as T;
    }, { retries: 3, baseMs: 500, capMs: 8_000, isRetryable: isRetryableError });
  };

  return {
    get: <T>(path: string, query?: Record<string, string | number>) =>
      request<T>("GET", path, undefined, query) as Promise<T>,
    put: <T>(path: string, body?: Record<string, unknown>) =>
      request<T>("PUT", path, body),
    post: <T>(path: string, body?: Record<string, unknown>) =>
      request<T>("POST", path, body),
    delete: <T>(path: string) =>
      request<T>("DELETE", path)
  };
};
